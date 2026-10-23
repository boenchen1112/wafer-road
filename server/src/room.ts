/**
 * Pure room logic (no Cloudflare APIs, no sockets, no timers). The Durable Object
 * in index.ts is thin glue: it feeds socket events and the clock in, persists
 * `room.data` after each change, sets one alarm at `nextWake()`, and broadcasts
 * `viewFor(memberId)` to every connected member.
 *
 * The server is authoritative: the full GameState lives only in `data.game`, and
 * clients only ever see the redacted output of src/online/view.ts.
 */
import { chooseAction } from '../../src/ai';
import { applyAction, checkAction, createGame, type Action, type GameEvent, type GameState } from '../../src/engine';
import { buildGameView } from '../../src/online/view';
import {
  DEFAULT_SETTINGS,
  MAX_NAME_LEN,
  type ClientAction,
  type Clock,
  type ErrorCode,
  type LogEntry,
  type MemberView,
  type RoomSettings,
  type RoomView,
  type SeatView,
} from '../../src/online/protocol';

/* ------------------------------------------------------------------ */
/* tunables                                                            */
/* ------------------------------------------------------------------ */

export const THINK_MS = 1000;
/** A disconnected human's turn is taken over by a Normal bot after this long. */
export const TAKEOVER_GRACE_MS = 20_000;
/** In the lobby (or an ended game) a disconnected member is dropped after this long. */
export const LOBBY_GRACE_MS = 60_000;
/** A disconnected host hands the role to the next connected human after this long. */
export const HOST_GRACE_MS = 10_000;
export const IDLE_MS = 2 * 60 * 60 * 1000;
export const ENDED_MS = 30 * 60 * 1000;
/** A room that was created but whose creator never connected. */
export const UNCLAIMED_MS = 10 * 60 * 1000;
const LOG_KEEP = 300;
const LOG_SEND = 120;

/* ------------------------------------------------------------------ */
/* persisted data                                                      */
/* ------------------------------------------------------------------ */

export interface Member {
  id: string;
  /** Secret. Never leaves the server except in the `welcome` frame to its owner. */
  token: string;
  name: string;
  seat: number | null;
  connected: boolean;
  disconnectedAt: number | null;
  /** A Normal bot is playing this member's seat (they were away on their turn). */
  autoplay: boolean;
  /** Explicitly left mid-game: the seat stays, played by a Normal bot. */
  left: boolean;
  joinedAt: number;
}

export interface Pending {
  kind: Clock['kind'];
  seat: number;
  /** data.actionSeq at the time it was scheduled; stale if the game moved on. */
  rev: number;
  at: number;
}

export interface RoomData {
  v: 1;
  code: string;
  createdAt: number;
  lastActivity: number;
  endedAt: number | null;
  phase: 'lobby' | 'playing' | 'ended';
  hostId: string | null;
  /** Token that the creator must present on first join (prevents code-guessing hijack). */
  reservedHostToken: string | null;
  settings: RoomSettings;
  members: Member[];
  game: GameState | null;
  gameSeats: Array<{ kind: 'human'; memberId: string } | { kind: 'bot'; level: 'easy' | 'normal' }>;
  log: LogEntry[];
  logSeq: number;
  rev: number;
  /** Counts game actions only (a pending timer is valid for exactly one value). */
  actionSeq: number;
  /** When the current decision began (last game action / start). */
  stateAt: number;
  pending: Pending | null;
}

export interface RoomDeps {
  rand: () => number;
  randomHex: (bytes: number) => string;
}

export const defaultDeps: RoomDeps = {
  rand: () => Math.random(),
  randomHex: (bytes) => {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  },
};

export type Res = { ok: true } | { ok: false; code: ErrorCode; msg: string };
const fail = (code: ErrorCode, msg: string): { ok: false; code: ErrorCode; msg: string } => ({ ok: false, code, msg });
const OK: Res = { ok: true };

export type JoinRes =
  | { ok: true; memberId: string; token: string; isNew: boolean }
  | { ok: false; code: ErrorCode; msg: string };

export interface TickResult {
  destroy: boolean;
  /** true when persisted data or what clients see has changed */
  changed: boolean;
}

/* ------------------------------------------------------------------ */

export class Room {
  constructor(
    public data: RoomData,
    private deps: RoomDeps = defaultDeps,
  ) {}

  static create(code: string, now: number, hostToken: string, deps: RoomDeps = defaultDeps): Room {
    return new Room(
      {
        v: 1,
        code,
        createdAt: now,
        lastActivity: now,
        endedAt: null,
        phase: 'lobby',
        hostId: null,
        reservedHostToken: hostToken,
        settings: structuredClone(DEFAULT_SETTINGS),
        members: [],
        game: null,
        gameSeats: [],
        log: [],
        logSeq: 0,
        rev: 0,
        actionSeq: 0,
        stateAt: now,
        pending: null,
      },
      deps,
    );
  }

  /* ---------------------------- queries ---------------------------- */

  member(id: string | null | undefined): Member | undefined {
    return id ? this.data.members.find((m) => m.id === id) : undefined;
  }

  get hostMember(): Member | undefined {
    return this.member(this.data.hostId);
  }

  connectedMembers(): Member[] {
    return this.data.members.filter((m) => m.connected);
  }

  /** Who is currently supposed to produce the moves for a seat of the running game. */
  private controller(seat: number): { kind: 'bot'; level: 'easy' | 'normal' } | { kind: 'human'; member: Member; away: boolean } {
    const gs = this.data.gameSeats[seat];
    if (gs.kind === 'bot') return { kind: 'bot', level: gs.level };
    const m = this.member(gs.memberId);
    if (!m || m.left) return { kind: 'bot', level: 'normal' };
    return { kind: 'human', member: m, away: !m.connected };
  }

  /* ---------------------------- joining ---------------------------- */

  handleJoin(req: { name: string; token?: string }, now: number): JoinRes {
    const d = this.data;
    d.lastActivity = now;
    const existing = req.token ? d.members.find((m) => m.token === req.token && !m.left) : undefined;
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.autoplay = false; // they take control back
      this.bump(now);
      this.reschedule(now);
      return { ok: true, memberId: existing.id, token: existing.token, isNew: false };
    }
    if (d.reservedHostToken && !d.hostId && req.token !== d.reservedHostToken) {
      return fail('not_ready', 'room is not open yet');
    }
    if (d.phase !== 'lobby') return fail('in_progress', 'game already in progress');
    const seat = this.freeSeat();
    if (seat === null) return fail('room_full', 'room is full');
    const isHost = !d.hostId;
    const token = isHost && d.reservedHostToken ? d.reservedHostToken : this.deps.randomHex(16);
    const m: Member = {
      id: this.deps.randomHex(6),
      token,
      name: this.uniqueName(req.name),
      seat,
      connected: true,
      disconnectedAt: null,
      autoplay: false,
      left: false,
      joinedAt: now,
    };
    d.members.push(m);
    if (isHost) d.hostId = m.id;
    this.bump(now);
    return { ok: true, memberId: m.id, token: m.token, isNew: true };
  }

  private freeSeat(): number | null {
    const taken = new Set(this.data.members.filter((m) => !m.left).map((m) => m.seat));
    for (let i = 0; i < this.data.settings.seats.length; i++) {
      if (this.data.settings.seats[i] === 'open' && !taken.has(i)) return i;
    }
    return null;
  }

  private uniqueName(raw: string): string {
    const base = (raw || 'Player').slice(0, MAX_NAME_LEN);
    const used = new Set(this.data.members.map((m) => m.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const suffix = ` ${i}`;
      const n = Array.from(base).slice(0, MAX_NAME_LEN - suffix.length).join('') + suffix;
      if (!used.has(n.toLowerCase())) return n;
    }
    return base;
  }

  markDisconnected(memberId: string, now: number): void {
    const m = this.member(memberId);
    if (!m || !m.connected) return;
    m.connected = false;
    m.disconnectedAt = now;
    this.bump(now);
    this.reschedule(now);
  }

  /**
   * After a Durable Object restart: align `connected` flags with the sockets that
   * actually exist (hibernated sockets survive; others do not).
   */
  reconcile(liveMemberIds: Set<string>, now: number): boolean {
    let changed = false;
    for (const m of this.data.members) {
      const live = liveMemberIds.has(m.id);
      if (m.connected && !live) {
        m.connected = false;
        m.disconnectedAt = now;
        changed = true;
      } else if (!m.connected && live) {
        m.connected = true;
        m.disconnectedAt = null;
        changed = true;
      }
    }
    if (changed) this.reschedule(now);
    return changed;
  }

  /* ---------------------------- messages --------------------------- */

  setSettings(memberId: string, s: RoomSettings, now: number): Res {
    const d = this.data;
    if (memberId !== d.hostId) return fail('not_host', 'only the host can change settings');
    if (d.phase !== 'lobby') return fail('wrong_phase', 'settings are locked once the game starts');
    for (const m of d.members) {
      if (m.left || m.seat === null) continue;
      if (m.seat >= s.seats.length || s.seats[m.seat] !== 'open') return fail('bad_settings', 'a seat with a player in it must stay open');
    }
    d.settings = structuredClone(s);
    d.lastActivity = now;
    this.bump(now);
    return OK;
  }

  start(memberId: string, now: number, seed?: number): Res {
    const d = this.data;
    if (memberId !== d.hostId) return fail('not_host', 'only the host can start');
    if (d.phase !== 'lobby') return fail('wrong_phase', 'game already started');
    const bySeat = new Map<number, Member>();
    for (const m of d.members) if (!m.left && m.seat !== null) bySeat.set(m.seat, m);
    const gameSeats: RoomData['gameSeats'] = [];
    for (let i = 0; i < d.settings.seats.length; i++) {
      const st = d.settings.seats[i];
      if (st === 'open') {
        const m = bySeat.get(i);
        if (!m) return fail('seats_open', 'every open seat needs a player (or switch it to a bot)');
        gameSeats.push({ kind: 'human', memberId: m.id });
      } else {
        gameSeats.push({ kind: 'bot', level: st });
      }
    }
    const rngSeed = seed ?? (parseInt(this.deps.randomHex(4), 16) >>> 0);
    const game = createGame({ numPlayers: gameSeats.length, endMode: d.settings.endMode }, rngSeed);
    d.game = game;
    d.gameSeats = gameSeats;
    d.log = [];
    d.endedAt = null;
    d.phase = 'playing';
    for (const m of d.members) m.autoplay = false;
    this.appendEvents(game.events);
    game.events = [];
    d.stateAt = now;
    d.actionSeq++;
    d.lastActivity = now;
    this.bump(now);
    this.reschedule(now);
    return OK;
  }

  handleAction(memberId: string, a: ClientAction, now: number): Res {
    const d = this.data;
    const m = this.member(memberId);
    if (!m) return fail('not_joined', 'not in this room');
    if (d.phase !== 'playing' || !d.game) return fail('wrong_phase', 'no game in progress');
    if (m.seat === null || m.left) return fail('not_your_turn', 'you have no seat');
    const seat = m.seat;
    if (d.game.current !== seat) return fail('not_your_turn', 'not your turn');
    const act: Action =
      a.type === 'discard'
        ? { type: 'discard', player: seat, cardId: a.cardId }
        : { type: 'play', player: seat, cardId: a.cardId, ...(a.target ? { target: a.target } : {}) };
    const err = checkAction(d.game, act);
    if (err) return fail('illegal_action', err);
    d.lastActivity = now;
    m.autoplay = false;
    this.applyLogged(act, now);
    return OK;
  }

  /** Host: back to the lobby for another game in the same room. */
  again(memberId: string, now: number): Res {
    const d = this.data;
    if (memberId !== d.hostId) return fail('not_host', 'only the host can start another game');
    if (d.phase !== 'ended') return fail('wrong_phase', 'the game is not over');
    d.members = d.members.filter((m) => !m.left);
    for (const m of d.members) {
      m.autoplay = false;
      if (!m.connected && m.disconnectedAt !== null) m.disconnectedAt = now;
    }
    d.phase = 'lobby';
    d.game = null;
    d.gameSeats = [];
    d.log = [];
    d.endedAt = null;
    d.pending = null;
    d.lastActivity = now;
    this.bump(now);
    return OK;
  }

  /** Returns true if the member was removed from the room entirely (caller closes socket). */
  leave(memberId: string, now: number): Res {
    const d = this.data;
    const m = this.member(memberId);
    if (!m) return fail('not_joined', 'not in this room');
    d.lastActivity = now;
    m.connected = false;
    m.disconnectedAt = now;
    if (d.phase === 'lobby') {
      d.members = d.members.filter((x) => x.id !== memberId);
    } else {
      m.left = true;
    }
    if (d.hostId === memberId) this.migrateHost(true);
    this.bump(now);
    this.reschedule(now);
    return OK;
  }

  /* ----------------------------- ticking --------------------------- */

  private shouldDestroy(now: number): boolean {
    const d = this.data;
    if (d.endedAt !== null && now - d.endedAt >= ENDED_MS) return true;
    if (now - d.lastActivity >= IDLE_MS) return true;
    if (!d.hostId && now - d.createdAt >= UNCLAIMED_MS) return true;
    if (d.hostId && d.members.length === 0) return true;
    return false;
  }

  tick(now: number): TickResult {
    const d = this.data;
    if (this.shouldDestroy(now)) return { destroy: true, changed: false };
    let changed = false;

    // Drop members who stayed away from the lobby / results screen.
    if (d.phase !== 'playing') {
      const before = d.members.length;
      d.members = d.members.filter((m) => m.connected || m.disconnectedAt === null || now - m.disconnectedAt < LOBBY_GRACE_MS);
      if (d.members.length !== before) {
        changed = true;
        if (d.hostId && !this.member(d.hostId)) this.migrateHost(true);
      }
    }

    // Host migration after a short grace period.
    const host = this.hostMember;
    if (host && !host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= HOST_GRACE_MS) {
      if (this.migrateHost(false)) changed = true;
    }

    // Scheduled game action (bot move / turn timeout / takeover).
    const p = d.pending;
    if (d.phase === 'playing' && d.game && p && p.at <= now) {
      if (p.rev === d.actionSeq && p.seat === d.game.current) {
        this.runPending(p, now);
        changed = true;
      } else {
        this.reschedule(now);
      }
    }
    if (changed) this.bump(now);
    if (this.shouldDestroy(now)) return { destroy: true, changed };
    return { destroy: false, changed };
  }

  private runPending(p: Pending, now: number): void {
    const d = this.data;
    const game = d.game!;
    const c = this.controller(p.seat);
    let level: 'easy' | 'normal' = 'normal';
    if (c.kind === 'bot') level = c.level;
    else if (p.kind === 'takeover') c.member.autoplay = true;
    // 'timeout' on a present human: play a Normal bot move for them, nothing sticky.
    const act = chooseAction(game, p.seat, level, this.deps.rand);
    this.applyLogged(act, now);
  }

  /** Earliest time something needs to happen without any client input; null = nothing. */
  nextWake(): number | null {
    const d = this.data;
    const c: number[] = [];
    if (d.pending) c.push(d.pending.at);
    if (d.endedAt !== null) c.push(d.endedAt + ENDED_MS);
    c.push(d.lastActivity + IDLE_MS);
    if (!d.hostId) c.push(d.createdAt + UNCLAIMED_MS);
    if (d.phase !== 'playing') {
      for (const m of d.members) if (!m.connected && m.disconnectedAt !== null) c.push(m.disconnectedAt + LOBBY_GRACE_MS);
    }
    const host = this.hostMember;
    if (host && !host.connected && host.disconnectedAt !== null && d.members.some((m) => m.connected && !m.left)) {
      c.push(host.disconnectedAt + HOST_GRACE_MS);
    }
    return c.length ? Math.min(...c) : null;
  }

  /* --------------------------- internals --------------------------- */

  private bump(_now: number): void {
    this.data.rev++;
  }

  private migrateHost(force: boolean): boolean {
    const d = this.data;
    const next = d.members
      .filter((m) => m.connected && !m.left && m.id !== d.hostId)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) {
      d.hostId = next.id;
      return true;
    }
    if (force) {
      // nobody connected: pass to the earliest remaining member (lobby leave / drop)
      const any = d.members.filter((m) => !m.left && m.id !== d.hostId).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (any) {
        d.hostId = any.id;
        return true;
      }
    }
    return false;
  }

  private appendEvents(events: GameEvent[]): void {
    const d = this.data;
    for (const ev of events) d.log.push({ id: ++d.logSeq, ev: structuredClone(ev) });
    if (d.log.length > LOG_KEEP) d.log = d.log.slice(-LOG_KEEP);
  }

  private applyLogged(act: Action, now: number): void {
    const d = this.data;
    d.game = applyAction(d.game!, act);
    this.appendEvents(d.game.events);
    d.stateAt = now;
    d.actionSeq++;
    d.game.events = []; // already in the log; keep stored state small
    this.bump(now);
    if (d.game.result) {
      d.phase = 'ended';
      d.endedAt = now;
      d.pending = null;
    } else {
      this.reschedule(now);
    }
  }

  /** Recompute `pending` for the current state. Keeps an existing identical timer. */
  reschedule(now: number): void {
    const d = this.data;
    const game = d.game;
    if (d.phase !== 'playing' || !game || !this.connectedMembers().length) {
      d.pending = null;
      return;
    }
    const seat = game.current;
    const c = this.controller(seat);
    let want: Pending | null = null;
    const keep = (kind: Pending['kind']): Pending | null =>
      d.pending && d.pending.kind === kind && d.pending.seat === seat && d.pending.rev === d.actionSeq ? d.pending : null;
    if (c.kind === 'bot') {
      want = keep('bot') ?? { kind: 'bot', seat, rev: d.actionSeq, at: now + THINK_MS };
    } else if (!c.away) {
      const secs = d.settings.timer;
      if (secs > 0) want = keep('timeout') ?? { kind: 'timeout', seat, rev: d.actionSeq, at: now + secs * 1000 };
    } else if (c.member.autoplay) {
      want = keep('takeover') ?? { kind: 'takeover', seat, rev: d.actionSeq, at: now + THINK_MS };
    } else {
      const grace = Math.min(TAKEOVER_GRACE_MS, d.settings.timer > 0 ? d.settings.timer * 1000 : Infinity);
      // The grace period starts when the turn begins or when they dropped, whichever is later.
      const since = Math.max(d.stateAt, c.member.disconnectedAt ?? now);
      want = { kind: 'takeover', seat, rev: d.actionSeq, at: since + grace };
    }
    d.pending = want;
  }

  /* ----------------------------- views ----------------------------- */

  viewFor(memberId: string, now: number): RoomView | null {
    const d = this.data;
    const m = this.member(memberId);
    if (!m) return null;
    const members: MemberView[] = d.members
      .filter((x) => !x.left || d.phase === 'playing' || d.phase === 'ended')
      .map((x) => ({
        id: x.id,
        name: x.name,
        seat: x.seat,
        connected: x.connected,
        isHost: x.id === d.hostId,
        autoplay: x.autoplay || x.left,
      }));
    let game: RoomView['game'] = null;
    if (d.game) {
      const seats: SeatView[] = d.gameSeats.map((gs) =>
        gs.kind === 'bot' ? { kind: 'bot', level: gs.level } : { kind: 'human', memberId: gs.memberId },
      );
      const seat = m.left ? null : m.seat;
      const canAct = seat !== null && d.game.current === seat && d.phase === 'playing' && this.controller(seat).kind === 'human';
      game = buildGameView(d.game, seats, seat, d.log.slice(-LOG_SEND), canAct);
    }
    const p = d.pending;
    return {
      code: d.code,
      phase: d.phase,
      rev: d.rev,
      serverNow: now,
      you: { id: m.id, seat: m.seat, isHost: m.id === d.hostId },
      settings: structuredClone(d.settings),
      members,
      clock: p && d.phase === 'playing' ? { kind: p.kind, seat: p.seat, at: p.at } : null,
      game,
    };
  }
}
