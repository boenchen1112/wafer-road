import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoomView, ServerMsg } from '../../../src/online/protocol';

const ORIGIN = 'https://boenchen1112.github.io';
const worker = exports.default as { fetch(req: Request): Promise<Response> };

async function createRoom(): Promise<{ code: string; token: string }> {
  const res = await worker.fetch(new Request('https://w/rooms', { method: 'POST', headers: { Origin: ORIGIN } }));
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  return res.json();
}

class Client {
  msgs: ServerMsg[] = [];
  closed: { code: number } | null = null;
  constructor(private ws: WebSocket) {
    ws.accept();
    ws.addEventListener('message', (e) => {
      this.msgs.push(JSON.parse(e.data as string));
    });
    ws.addEventListener('close', (e) => {
      this.closed = { code: e.code };
    });
  }
  static async open(code: string): Promise<Client> {
    const res = await worker.fetch(new Request(`https://w/ws/${code}`, { headers: { Upgrade: 'websocket', Origin: ORIGIN } }));
    expect(res.status).toBe(101);
    return new Client(res.webSocket!);
  }
  send(m: unknown) {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }
  raw() {
    return this.ws;
  }
  async until<T>(pick: () => T | undefined, ms = 8000): Promise<T> {
    const t0 = Date.now();
    for (;;) {
      const v = pick();
      if (v !== undefined) return v;
      if (Date.now() - t0 > ms) throw new Error('timeout; msgs=' + JSON.stringify(this.msgs.slice(-3)).slice(0, 600));
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  room(): RoomView | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m.t === 'room') return m.room;
    }
  }
  welcome() {
    return this.msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }> | undefined;
  }
  error() {
    return [...this.msgs].reverse().find((m) => m.t === 'error') as Extract<ServerMsg, { t: 'error' }> | undefined;
  }
}

describe('worker', () => {
  it('serves /health and enforces the Origin allow-list', async () => {
    expect((await worker.fetch(new Request('https://w/health'))).status).toBe(200);
    for (const origin of [null, 'https://evil.example']) {
      const headers: Record<string, string> = origin ? { Origin: origin } : {};
      expect((await worker.fetch(new Request('https://w/rooms', { method: 'POST', headers }))).status).toBe(403);
      expect((await worker.fetch(new Request('https://w/ws/BCDF', { headers: { ...headers, Upgrade: 'websocket' } }))).status).toBe(403);
    }
    const pre = await worker.fetch(new Request('https://w/rooms', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('creates rooms with consonant-only 4-letter codes', async () => {
    const { code, token } = await createRoom();
    expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('room over WebSocket', () => {
  it('reports an unknown room without creating it', async () => {
    const c = await Client.open('ZZZZ');
    await c.until(() => c.error());
    expect(c.error()!.code).toBe('no_room');
  });

  it('lobby -> start -> play, with per-player hidden hands, a bot seat, and no leaked internals', async () => {
    const { code, token } = await createRoom();
    const host = await Client.open(code);
    host.send({ t: 'join', name: 'Host', token });
    await host.until(() => host.room());
    expect(host.welcome()!.token).toBe(token);
    expect(host.room()!.you.isHost).toBe(true);

    const guest = await Client.open(code);
    guest.send({ t: 'join', name: 'Guest' });
    await guest.until(() => guest.room());
    expect(guest.room()!.you).toMatchObject({ isHost: false, seat: 1 });
    await host.until(() => (host.room()!.members.length === 2 ? true : undefined));

    // non-host cannot start
    guest.send({ t: 'start' });
    await guest.until(() => guest.error());
    expect(guest.error()!.code).toBe('not_host');

    host.send({ t: 'settings', settings: { seats: ['open', 'open', 'easy'], endMode: 'timed', timer: 0 } });
    await guest.until(() => (guest.room()!.settings.seats.length === 3 ? true : undefined));
    host.send({ t: 'start' });
    const hv = await host.until(() => host.room()!.game ?? undefined);
    const gv = await guest.until(() => guest.room()!.game ?? undefined);
    expect(hv.hand).toHaveLength(5); // current player has drawn
    expect(gv.hand).toHaveLength(4);
    const hostIds = new Set(hv.hand.map((c) => c.id));
    expect(gv.hand.some((c) => hostIds.has(c.id))).toBe(false);
    const wire = JSON.stringify(host.msgs.filter((m) => m.t === 'room').slice(-1));
    expect(wire).not.toMatch(/"(rng|seed|deck)"/);
    expect(wire).not.toContain(guest.welcome()!.token);

    // illegal / out-of-turn
    const errs = guest.msgs.length;
    guest.send({ t: 'action', action: { type: 'discard', cardId: gv.hand[0].id } });
    await guest.until(() => (guest.msgs.length > errs ? true : undefined));
    expect(guest.error()!.code).toBe('not_your_turn');

    // host plays; guest then plays; the easy bot (seat 2) answers by itself via the alarm
    host.send({ t: 'action', action: { type: 'discard', cardId: hv.hand[0].id } });
    await guest.until(() => (guest.room()!.game!.current === 1 ? true : undefined));
    const g2 = guest.room()!.game!;
    guest.send({ t: 'action', action: { type: 'discard', cardId: g2.hand[0].id } });
    await host.until(() => (host.room()!.game!.current === 2 ? true : undefined));
    await host.until(() => (host.room()!.game!.current === 0 ? true : undefined), 8000); // bot moved after its think delay
    expect(host.room()!.game!.log.some((l) => l.ev.type === 'discard' || l.ev.type === 'play')).toBe(true);
  });

  it('rejoins by token after the socket drops, with the same seat and hand', async () => {
    const { code, token } = await createRoom();
    const host = await Client.open(code);
    host.send({ t: 'join', name: 'Host', token });
    host.send({ t: 'settings', settings: { seats: ['open', 'normal'], endMode: 'timed', timer: 0 } });
    await host.until(() => host.room());
    host.send({ t: 'start' });
    const before = await host.until(() => host.room()!.game ?? undefined);
    host.raw().close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 100));

    const again = await Client.open(code);
    again.send({ t: 'join', name: 'ignored', token });
    const after = await again.until(() => again.room()?.game ?? undefined);
    expect(again.room()!.you).toMatchObject({ isHost: true, seat: 0 });
    expect(after.hand).toEqual(before.hand);
  });

  it('keeps state across a Durable Object eviction (hibernation) and keeps sockets alive', async () => {
    const { code, token } = await createRoom();
    const host = await Client.open(code);
    host.send({ t: 'join', name: 'Host', token });
    await host.until(() => host.room());
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await evictDurableObject(stub, { webSockets: 'hibernate' });
    host.send({ t: 'settings', settings: { seats: ['open', 'easy'], endMode: 'long', timer: 30 } });
    await host.until(() => (host.room()!.settings.timer === 30 ? true : undefined));
    expect(host.room()!.settings.endMode).toBe('long');
    const stored = await runInDurableObject(stub, async (_i, state) => (await state.storage.get<{ code: string }>('room'))?.code);
    expect(stored).toBe(code);
  });

  it('rejects oversize frames, bad JSON and floods; replaces a duplicate connection', async () => {
    const { code, token } = await createRoom();
    const a = await Client.open(code);
    a.send({ t: 'join', name: 'A', token });
    await a.until(() => a.room());
    a.send('{nope');
    await a.until(() => a.error());
    expect(a.error()!.code).toBe('bad_message');

    const b = await Client.open(code);
    b.send({ t: 'join', name: 'A2', token });
    await b.until(() => b.room());
    await a.until(() => a.closed ?? undefined);
    expect(a.closed!.code).toBe(4001);

    b.send('x'.repeat(2000));
    await b.until(() => b.closed ?? undefined);
    expect(b.closed!.code).toBe(1009);

    const c = await Client.open(code);
    c.send({ t: 'join', name: 'A3', token });
    await c.until(() => c.room());
    for (let i = 0; i < 80; i++) c.send({ t: 'nope' });
    await c.until(() => c.msgs.some((m) => m.t === 'error' && m.code === 'rate_limited') || undefined);
  });

  it('deletes the room from storage (and closes sockets) when the idle alarm fires after 2 hours', async () => {
    const { code, token } = await createRoom();
    const host = await Client.open(code);
    host.send({ t: 'join', name: 'Host', token });
    await host.until(() => host.room());
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    // pretend the room has been idle for 3 hours
    await runInDurableObject(stub, async (instance: unknown, state) => {
      const room = (instance as { room: { data: { lastActivity: number } } }).room;
      room.data.lastActivity -= 3 * 3600_000;
      await state.storage.put('room', room.data);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await host.until(() => host.closed ?? undefined);
    const left = await runInDurableObject(stub, async (_i, state) => state.storage.get('room'));
    expect(left).toBeUndefined();
    // a late joiner now sees an unknown room
    const late = await Client.open(code);
    await late.until(() => late.error());
    expect(late.error()!.code).toBe('no_room');
  });
});
