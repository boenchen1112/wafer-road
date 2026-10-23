/**
 * Wire protocol shared by the browser client and the Worker. Pure types plus a
 * strict hand-written parser for client -> server messages (no dependencies).
 *
 * All frames are JSON text. Server -> client frames are `ServerMsg`; client ->
 * server frames are `ClientMsg`. The literal text frame "ping" is answered with
 * "pong" by the Durable Object without waking it (WebSocket auto-response).
 */
import type { Action, Card, EndMode, GameEvent, GameResult, Phase } from '../engine';

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

/** Consonants only: no O/0/I/1 confusion and no accidental words. */
export const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LEN = 4;
export const ROOM_CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
export const TOKEN_RE = /^[0-9a-f]{32,64}$/;

export const MIN_SEATS = 2;
export const MAX_SEATS = 5;
export const MAX_NAME_LEN = 16;
/** Hard cap for a single inbound frame (bytes of UTF-8, approximated by length*3). */
export const MAX_MESSAGE_CHARS = 1024;
export const TIMER_OPTIONS = [0, 30, 60, 90] as const;
export type TimerSetting = (typeof TIMER_OPTIONS)[number];
export const SEAT_OPTIONS = ['open', 'easy', 'normal'] as const;
export type SeatSetting = (typeof SEAT_OPTIONS)[number];

export interface RoomSettings {
  /** One entry per seat (2..5). */
  seats: SeatSetting[];
  endMode: EndMode;
  /** Seconds per decision; 0 = off. */
  timer: TimerSetting;
}

export const DEFAULT_SETTINGS: RoomSettings = { seats: ['open', 'open'], endMode: 'timed', timer: 0 };

/* ------------------------------------------------------------------ */
/* client -> server                                                    */
/* ------------------------------------------------------------------ */

export interface ClientAction {
  type: 'play' | 'discard';
  cardId: number;
  target?: { player: number; wafer?: 0 | 1 };
}

export type ClientMsg =
  | { t: 'join'; name: string; token?: string }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'start' }
  | { t: 'action'; action: ClientAction }
  | { t: 'again' }
  | { t: 'leave' };

export type ParseResult = { ok: true; msg: ClientMsg } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Trim, drop control chars, collapse whitespace, cap at MAX_NAME_LEN code points. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, MAX_NAME_LEN).join('').trim();
}

export function parseSettings(v: unknown): RoomSettings | null {
  if (!isObj(v)) return null;
  const { seats, endMode, timer } = v;
  if (!Array.isArray(seats) || seats.length < MIN_SEATS || seats.length > MAX_SEATS) return null;
  if (!seats.every((s) => (SEAT_OPTIONS as readonly unknown[]).includes(s))) return null;
  if (endMode !== 'timed' && endMode !== 'long') return null;
  if (!(TIMER_OPTIONS as readonly unknown[]).includes(timer)) return null;
  return { seats: [...(seats as SeatSetting[])], endMode, timer: timer as TimerSetting };
}

export function parseClientMessage(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return { ok: false, error: 'text frames only' };
  if (raw.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'message too large' };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid json' };
  }
  if (!isObj(v) || typeof v.t !== 'string') return { ok: false, error: 'missing type' };
  switch (v.t) {
    case 'join': {
      const name = sanitizeName(v.name);
      if (v.token !== undefined && (typeof v.token !== 'string' || !TOKEN_RE.test(v.token))) return { ok: false, error: 'bad token' };
      return { ok: true, msg: { t: 'join', name, token: v.token as string | undefined } };
    }
    case 'settings': {
      const settings = parseSettings(v.settings);
      return settings ? { ok: true, msg: { t: 'settings', settings } } : { ok: false, error: 'bad settings' };
    }
    case 'start':
    case 'again':
    case 'leave':
      return { ok: true, msg: { t: v.t } };
    case 'action': {
      const a = v.action;
      if (!isObj(a)) return { ok: false, error: 'bad action' };
      if (a.type !== 'play' && a.type !== 'discard') return { ok: false, error: 'bad action type' };
      if (!isInt(a.cardId, 0, 255)) return { ok: false, error: 'bad card id' };
      const out: ClientAction = { type: a.type, cardId: a.cardId };
      if (a.target !== undefined) {
        const t = a.target;
        if (a.type === 'discard') return { ok: false, error: 'discard takes no target' };
        if (!isObj(t) || !isInt(t.player, 0, MAX_SEATS - 1)) return { ok: false, error: 'bad target' };
        if (t.wafer !== undefined && t.wafer !== 0 && t.wafer !== 1) return { ok: false, error: 'bad wafer' };
        out.target = t.wafer === undefined ? { player: t.player } : { player: t.player, wafer: t.wafer };
      }
      return { ok: true, msg: { t: 'action', action: out } };
    }
    default:
      return { ok: false, error: 'unknown message type' };
  }
}

/* ------------------------------------------------------------------ */
/* server -> client                                                    */
/* ------------------------------------------------------------------ */

export type ErrorCode =
  | 'bad_message'
  | 'rate_limited'
  | 'no_room'
  | 'room_full'
  | 'in_progress'
  | 'not_joined'
  | 'already_joined'
  | 'not_host'
  | 'wrong_phase'
  | 'bad_settings'
  | 'seats_open'
  | 'not_your_turn'
  | 'illegal_action'
  | 'replaced'
  | 'not_ready';

export interface LogEntry {
  id: number;
  ev: GameEvent;
}

export interface MemberView {
  id: string;
  name: string;
  seat: number | null;
  connected: boolean;
  isHost: boolean;
  /** A bot is currently playing this member's seat (disconnected / left). */
  autoplay: boolean;
}

export interface SeatView {
  kind: 'human' | 'bot';
  level?: 'easy' | 'normal';
  /** Member id for human seats. */
  memberId?: string;
}

export interface PublicPlayer {
  handCount: number;
  wafers: [number, number];
  protections: Card[];
}

export interface Clock {
  /** timeout: human turn timer; takeover: disconnected human's grace period; bot: bot think delay. */
  kind: 'timeout' | 'takeover' | 'bot';
  seat: number;
  /** Server epoch ms. */
  at: number;
}

export interface GameView {
  endMode: EndMode;
  numPlayers: number;
  seats: SeatView[];
  /** Seat of the recipient (null for a recipient without a seat). */
  you: number | null;
  current: number;
  phase: Phase;
  turnCount: number;
  finalTurnsLeft: number | null;
  result: GameResult | null;
  deckCount: number;
  discard: Card[];
  players: PublicPlayer[];
  /** The recipient's own hand. Others' hands are never sent. */
  hand: Card[];
  /** Legal actions for the recipient (empty unless it is their turn). */
  legal: Action[];
  log: LogEntry[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'ended';
  rev: number;
  /** Server clock at send time, for countdown offset. */
  serverNow: number;
  you: { id: string; seat: number | null; isHost: boolean };
  settings: RoomSettings;
  members: MemberView[];
  clock: Clock | null;
  game: GameView | null;
}

export type ServerMsg =
  | { t: 'welcome'; token: string; id: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; code: ErrorCode; msg: string };
