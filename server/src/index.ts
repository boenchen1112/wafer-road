/**
 * Cloudflare Worker entry + the per-room Durable Object (SQLite-backed, WebSocket
 * Hibernation API). All game/room rules live in room.ts; this file is glue.
 *
 *   POST /rooms        -> { code, token }   create a room (token = host's secret)
 *   GET  /ws/:code     -> WebSocket         join / play (see src/online/protocol.ts)
 *   GET  /health       -> { ok: true }
 */
import { DurableObject } from 'cloudflare:workers';
import { MAX_MESSAGE_CHARS, ROOM_ALPHABET, ROOM_CODE_LEN, ROOM_CODE_RE, parseClientMessage, type ErrorCode, type ServerMsg } from '../../src/online/protocol';
import { KeyedLimiter, TokenBucket, isAllowedOrigin } from './guards';
import { Room, type RoomData } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<WaferRoom>;
  /** Optional comma-separated extra allowed origins (for forks). */
  ALLOWED_ORIGINS?: string;
}

const UNJOINED_MS = 10_000;

interface Attachment {
  memberId: string | null;
  at: number;
}

/* ------------------------------------------------------------------ */
/* Durable Object                                                      */
/* ------------------------------------------------------------------ */

export class WaferRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private buckets = new WeakMap<WebSocket, TokenBucket>();
  private strikes = new WeakMap<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      const data = await ctx.storage.get<RoomData>('room');
      if (data) {
        this.room = new Room(data);
        const live = new Set<string>();
        for (const ws of ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Attachment | null;
          if (a?.memberId) live.add(a.memberId);
        }
        if (this.room.reconcile(live, Date.now())) await ctx.storage.put('room', this.room.data);
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/create' && req.method === 'POST') {
      if (this.room) return new Response('exists', { status: 409 });
      const { code, hostToken } = (await req.json()) as { code: string; hostToken: string };
      const now = Date.now();
      this.room = Room.create(code, now, hostToken);
      await this.commit(now);
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const att: Attachment = { memberId: null, at: Date.now() };
    server.serializeAttachment(att);
    if (!this.room) {
      this.sendErr(server, 'no_room', 'room not found');
      server.close(4004, 'no room');
    } else {
      await this.armAlarm();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ------------------------------ sockets ------------------------------ */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const now = Date.now();
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_CHARS) {
      ws.close(1009, 'message too large');
      return;
    }
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new TokenBucket(20, 8, now);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.take(now)) {
      const n = (this.strikes.get(ws) ?? 0) + 1;
      this.strikes.set(ws, n);
      if (n > 25) {
        ws.close(1008, 'rate limit');
        return;
      }
      this.sendErr(ws, 'rate_limited', 'slow down');
      return;
    }
    const room = this.room;
    if (!room) {
      this.sendErr(ws, 'no_room', 'room not found');
      ws.close(4004, 'no room');
      return;
    }
    const parsed = parseClientMessage(message);
    if (!parsed.ok) {
      this.sendErr(ws, 'bad_message', parsed.error);
      return;
    }
    const msg = parsed.msg;
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { memberId: null, at: now };

    if (msg.t === 'join') {
      if (att.memberId) return void this.sendErr(ws, 'already_joined', 'already joined');
      const res = room.handleJoin({ name: msg.name, token: msg.token }, now);
      if (!res.ok) {
        this.sendErr(ws, res.code, res.msg);
        ws.close(4003, res.code);
        return;
      }
      // One live socket per member: a newer connection replaces the older one.
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const oa = other.deserializeAttachment() as Attachment | null;
        if (oa?.memberId === res.memberId) {
          other.serializeAttachment({ memberId: null, at: 0 } satisfies Attachment);
          this.sendErr(other, 'replaced', 'opened elsewhere');
          other.close(4001, 'replaced');
        }
      }
      ws.serializeAttachment({ memberId: res.memberId, at: att.at } satisfies Attachment);
      this.send(ws, { t: 'welcome', token: res.token, id: res.memberId });
      await this.commit(now);
      return;
    }

    const id = att.memberId;
    if (!id || !room.member(id)) return void this.sendErr(ws, 'not_joined', 'send join first');
    room.data.lastActivity = now;

    let r;
    switch (msg.t) {
      case 'settings':
        r = room.setSettings(id, msg.settings, now);
        break;
      case 'start':
        r = room.start(id, now);
        break;
      case 'action':
        r = room.handleAction(id, msg.action, now);
        break;
      case 'again':
        r = room.again(id, now);
        break;
      case 'leave':
        ws.serializeAttachment({ memberId: null, at: att.at } satisfies Attachment);
        r = room.leave(id, now);
        ws.close(1000, 'left');
        break;
    }
    if (r && !r.ok) this.sendErr(ws, r.code, r.msg);
    await this.commit(now);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
    await this.gone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.gone(ws);
  }

  private async gone(ws: WebSocket): Promise<void> {
    const room = this.room;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!room || !att?.memberId) return;
    // Another live socket for the same member? Then they are still connected.
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      if ((other.deserializeAttachment() as Attachment | null)?.memberId === att.memberId) return;
    }
    const now = Date.now();
    room.markDisconnected(att.memberId, now);
    await this.commit(now);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.memberId && now - a.at >= UNJOINED_MS) ws.close(4002, 'join timeout');
    }
    if (!this.room) return;
    await this.commit(now);
  }

  /* ------------------------------ plumbing ------------------------------ */

  /** Run due timers, persist, push views to everyone connected, re-arm the alarm. */
  private async commit(now: number): Promise<void> {
    const room = this.room;
    if (!room) return;
    const res = room.tick(now);
    if (res.destroy) {
      await this.destroy();
      return;
    }
    await this.ctx.storage.put('room', room.data);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a?.memberId) continue;
      const view = room.viewFor(a.memberId, now);
      if (view) this.send(ws, { t: 'room', room: view });
    }
    await this.armAlarm();
  }

  private async armAlarm(): Promise<void> {
    const times: number[] = [];
    const w = this.room?.nextWake();
    if (w !== null && w !== undefined) times.push(w);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a && !a.memberId && a.at > 0) times.push(a.at + UNJOINED_MS);
    }
    if (times.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...times)));
    else await this.ctx.storage.deleteAlarm();
  }

  private async destroy(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      ws.serializeAttachment({ memberId: null, at: 0 } satisfies Attachment);
      try {
        ws.close(1000, 'room closed');
      } catch {
        /* ignore */
      }
    }
    this.room = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already gone */
    }
  }

  private sendErr(ws: WebSocket, code: ErrorCode, msg: string): void {
    this.send(ws, { t: 'error', code, msg });
  }
}

/* ------------------------------------------------------------------ */
/* Worker                                                              */
/* ------------------------------------------------------------------ */

const createLimiter = new KeyedLimiter(6, 6 / 60); // burst 6, then 6 per minute per IP
const connectLimiter = new KeyedLimiter(30, 0.5); // burst 30, then 1 per 2s per IP

function randomCode(): string {
  let out = '';
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const limit = 256 - (256 % ROOM_ALPHABET.length);
  for (const b of buf) {
    if (b >= limit) continue;
    out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
    if (out.length === ROOM_CODE_LEN) return out;
  }
  return randomCode();
}

function randomToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'wafer-road' }, 200);

    const origin = req.headers.get('Origin');
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) return json({ error: 'origin not allowed' }, 403);
    const cors = {
      'access-control-allow-origin': origin!,
      'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
    const now = Date.now();

    if (url.pathname === '/rooms' && req.method === 'POST') {
      if (!createLimiter.allow(ip, now)) return json({ error: 'too many rooms, try again shortly' }, 429, cors);
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const token = randomToken();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/create', { method: 'POST', body: JSON.stringify({ code, hostToken: token }) });
        if (res.status === 409) continue; // code collision
        if (!res.ok) return json({ error: 'could not create room' }, 500, cors);
        return json({ code, token }, 200, cors);
      }
      return json({ error: 'no free room code, try again' }, 503, cors);
    }

    const m = /^\/ws\/([A-Z]{4})$/.exec(url.pathname);
    if (m && req.method === 'GET') {
      if (!ROOM_CODE_RE.test(m[1])) return json({ error: 'bad room code' }, 400, cors);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426, cors);
      if (!connectLimiter.allow(ip, now)) return json({ error: 'too many connections' }, 429, cors);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(req);
    }
    return json({ error: 'not found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
