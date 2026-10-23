/**
 * Browser-side online client: one WebSocket to the room's Durable Object, with
 * token-based rejoin, reconnect/backoff, keep-alive, and a store the UI subscribes to.
 * Also adapts the redacted server view into the shared table view model.
 */
import { useEffect, useState } from 'preact/hooks';
import * as sfx from '../audio/sfx';
import type { Action, GameEvent } from '../engine';
import { t } from '../i18n';
import type { Banner, LogItem, TableModel } from '../ui/model';
import { playSounds } from '../ui/store';
import { ROOM_CODE_RE, type ClientMsg, type ErrorCode, type RoomSettings, type RoomView, type ServerMsg } from './protocol';

/* ------------------------------------------------------------------ */
/* configuration                                                       */
/* ------------------------------------------------------------------ */

/** wss://wafer-road.<subdomain>.workers.dev (build-time). Local dev falls back to wrangler dev. */
export function serverUrl(): string | null {
  const v = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (v) return v.replace(/\/+$/, '');
  if (import.meta.env.DEV) return 'ws://localhost:8787';
  return null;
}

export function onlineConfigured(): boolean {
  return serverUrl() !== null;
}

function httpBase(): string {
  return serverUrl()!.replace(/^ws/, 'http');
}

/* ------------------------------------------------------------------ */
/* local storage (every access guarded)                                */
/* ------------------------------------------------------------------ */

const NAME_KEY = 'wafer-road:name';
const tokenKey = (code: string) => `wafer-road:room:${code}`;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function lsDel(k: string): void {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export const savedName = (): string => lsGet(NAME_KEY) ?? '';
export const saveName = (n: string): void => lsSet(NAME_KEY, n);
export const savedToken = (code: string): string | null => lsGet(tokenKey(code));

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

/** The room code in the page URL (?room=ABCD), if valid. */
export function inviteCode(): string | null {
  try {
    const c = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
    return ROOM_CODE_RE.test(c) ? c : null;
  } catch {
    return null;
  }
}

export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.hash = '';
  u.search = '';
  u.searchParams.set('room', code);
  return u.toString();
}

function setUrlRoom(code: string | null): void {
  try {
    const u = new URL(location.href);
    if (code) u.searchParams.set('room', code);
    else u.searchParams.delete('room');
    history.replaceState(null, '', u.toString());
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export type FatalCode = ErrorCode | 'network' | 'unconfigured';

export interface OnlineState {
  code: string;
  name: string;
  link: 'connecting' | 'open' | 'reconnecting';
  joined: boolean;
  room: RoomView | null;
  fatal: { code: FatalCode; msg: string } | null;
  /** Transient server error (shown as a toast). */
  notice: { id: number; code: ErrorCode; msg: string } | null;
  log: LogItem[];
  banner: Banner | null;
  /** serverNow - Date.now() */
  offset: number;
  gameNo: number;
}

let state: OnlineState | null = null;
let ws: WebSocket | null = null;
let intentional = false;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let lastRx = 0;
let lastLogId = 0;
let seenGame = false;
let bannerSeq = 1;
let noticeSeq = 1;
let gameCounter = 1;
let wasMyTurn = false;
let resync = true;
const listeners = new Set<() => void>();

const FATAL: ErrorCode[] = ['no_room', 'in_progress', 'room_full', 'not_ready', 'replaced'];

function emit(): void {
  listeners.forEach((f) => f());
}

export function getOnline(): OnlineState | null {
  return state;
}

export function useOnline(): OnlineState | null {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return state;
}

function clearTimers(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  if (bannerTimer) clearTimeout(bannerTimer);
  if (noticeTimer) clearTimeout(noticeTimer);
  reconnectTimer = pingTimer = bannerTimer = noticeTimer = null;
}

/** Enter a room (already created, or joining by code). Never throws. */
export function openRoom(code: string, name: string): void {
  closeSocket();
  clearTimers();
  intentional = false;
  attempts = 0;
  lastLogId = 0;
  seenGame = false;
  wasMyTurn = false;
  state = {
    code,
    name,
    link: 'connecting',
    joined: false,
    room: null,
    fatal: null,
    notice: null,
    log: [],
    banner: null,
    offset: 0,
    gameNo: 0,
  };
  saveName(name);
  setUrlRoom(code);
  emit();
  if (!onlineConfigured()) {
    fail('unconfigured', 'Online mode not configured');
    return;
  }
  connect();
}

/** Host: create a room on the server, then join it. Rejects with a readable message. */
export async function createRoom(name: string): Promise<void> {
  if (!onlineConfigured()) throw new Error('unconfigured');
  let res: Response;
  try {
    res = await fetch(`${httpBase()}/rooms`, { method: 'POST' });
  } catch {
    throw new Error('network');
  }
  if (res.status === 429) throw new Error('rate');
  if (!res.ok) throw new Error('server');
  const { code, token } = (await res.json()) as { code: string; token: string };
  lsSet(tokenKey(code), token);
  openRoom(code, name);
}

/** Resume a room from the URL if we hold its token (refresh / reopened tab). */
export function resumeFromUrl(): boolean {
  if (state) return true;
  const code = inviteCode();
  if (!code || !onlineConfigured()) return false;
  const tok = savedToken(code);
  if (!tok) return false;
  openRoom(code, savedName() || 'Player');
  return true;
}

export function leaveRoom(): void {
  if (!state) return;
  const code = state.code;
  intentional = true;
  try {
    ws?.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
  } catch {
    /* ignore */
  }
  closeSocket();
  clearTimers();
  lsDel(tokenKey(code));
  state = null;
  setUrlRoom(null);
  emit();
}

/** Drop the screen (e.g. after a fatal error) without telling the server. */
export function dismissRoom(): void {
  if (!state) return;
  intentional = true;
  closeSocket();
  clearTimers();
  if (state.fatal?.code === 'no_room' || state.fatal?.code === 'in_progress') lsDel(tokenKey(state.code));
  state = null;
  setUrlRoom(null);
  emit();
}

export function send(msg: ClientMsg): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

export const sendSettings = (settings: RoomSettings) => send({ t: 'settings', settings });
export const startOnlineGame = () => send({ t: 'start' });
export const playAgain = () => send({ t: 'again' });

export function sendAction(a: Action): boolean {
  const out =
    a.type === 'discard'
      ? ({ type: 'discard', cardId: a.cardId } as const)
      : ({ type: 'play', cardId: a.cardId, ...(a.target ? { target: a.target } : {}) } as const);
  return send({ t: 'action', action: out });
}

/* ------------------------------ internals ------------------------------ */

function closeSocket(): void {
  const w = ws;
  ws = null;
  if (w) {
    w.onopen = w.onmessage = w.onclose = w.onerror = null;
    try {
      w.close(1000);
    } catch {
      /* ignore */
    }
  }
}

function fail(code: FatalCode, msg: string): void {
  if (!state) return;
  intentional = true;
  closeSocket();
  clearTimers();
  state = { ...state, fatal: { code, msg } };
  emit();
}

function connect(): void {
  if (!state || state.fatal) return;
  const code = state.code;
  let sock: WebSocket;
  try {
    sock = new WebSocket(`${serverUrl()}/ws/${code}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = sock;
  lastRx = Date.now();
  state = { ...state, link: attempts > 0 ? 'reconnecting' : 'connecting' };
  emit();
  sock.onopen = () => {
    if (ws !== sock || !state) return;
    lastRx = Date.now();
    resync = true; // the first snapshot after (re)connecting replaces the log silently
    const token = savedToken(code) ?? undefined;
    sock.send(JSON.stringify({ t: 'join', name: state.name, ...(token ? { token } : {}) } satisfies ClientMsg));
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws !== sock) return;
      if (Date.now() - lastRx > 45_000) {
        // half-dead connection (typical on mobile after backgrounding): force a reconnect
        sock.close();
        return;
      }
      try {
        sock.send('ping');
      } catch {
        /* ignore */
      }
    }, 15_000);
  };
  sock.onmessage = (e) => {
    lastRx = Date.now();
    if (typeof e.data !== 'string' || e.data === 'pong') return;
    let msg: ServerMsg;
    try {
      msg = JSON.parse(e.data) as ServerMsg;
    } catch {
      return;
    }
    onServerMsg(msg);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    if (intentional || !state || state.fatal) return;
    scheduleReconnect();
  };
  sock.onerror = () => {
    /* onclose follows */
  };
}

function scheduleReconnect(): void {
  if (!state || state.fatal || intentional) return;
  state = { ...state, link: 'reconnecting', joined: false };
  emit();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(8000, 700 * 2 ** Math.min(attempts, 4));
  attempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/** Reconnect right away (tab became visible / network is back). */
function nudge(): void {
  if (!state || state.fatal || intentional) return;
  if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastRx < 45_000) return;
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  closeSocket();
  attempts = 0;
  connect();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', nudge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') nudge();
  });
}

function onServerMsg(msg: ServerMsg): void {
  if (!state) return;
  switch (msg.t) {
    case 'welcome':
      lsSet(tokenKey(state.code), msg.token);
      attempts = 0;
      state = { ...state, joined: true, link: 'open' };
      emit();
      return;
    case 'error':
      if ((FATAL as string[]).includes(msg.code)) {
        if (msg.code === 'replaced') {
          fail('replaced', msg.msg);
          return;
        }
        fail(msg.code, msg.msg);
        return;
      }
      state = { ...state, notice: { id: noticeSeq++, code: msg.code, msg: msg.msg } };
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        if (state) {
          state = { ...state, notice: null };
          emit();
        }
      }, 4000);
      emit();
      return;
    case 'room':
      onRoom(msg.room);
      return;
  }
}

function onRoom(room: RoomView): void {
  if (!state) return;
  const game = room.game;
  let log = state.log;
  let banner = state.banner;
  let gameNo = state.gameNo;
  if (!game) {
    log = [];
    lastLogId = 0;
    seenGame = false;
    wasMyTurn = false;
  } else {
    if (!seenGame || resync) {
      if (!seenGame) gameNo = gameCounter++;
      log = game.log.map((l) => ({ id: l.id, ev: l.ev }));
      lastLogId = game.log.length ? game.log[game.log.length - 1].id : 0;
      seenGame = true;
      banner = null;
      wasMyTurn = game.legal.length > 0;
    } else {
      const fresh = game.log.filter((l) => l.id > lastLogId);
      if (fresh.length) {
        lastLogId = fresh[fresh.length - 1].id;
        const evs: GameEvent[] = fresh.map((l) => l.ev);
        log = [...log, ...fresh.map((l) => ({ id: l.id, ev: l.ev }))].slice(-500);
        playSounds(evs);
        const played = [...evs].reverse().find((e) => e.type === 'play');
        if (played && played.type === 'play') {
          banner = { id: bannerSeq++, actor: played.player, card: played.card.kind, target: played.target };
          const myId = banner.id;
          if (bannerTimer) clearTimeout(bannerTimer);
          bannerTimer = setTimeout(() => {
            if (state && state.banner?.id === myId) {
              state = { ...state, banner: null };
              emit();
            }
          }, 1500);
        } else if (evs.some((e) => e.type === 'discard')) {
          banner = null;
        }
      }
    }
    const myTurn = game.legal.length > 0;
    if (myTurn && !wasMyTurn && game.phase === 'action') sfx.play('turn');
    wasMyTurn = myTurn;
  }
  resync = false;
  state = { ...state, room, log, banner, gameNo, offset: room.serverNow - Date.now(), link: 'open', joined: true };
  emit();
}

/* ------------------------------------------------------------------ */
/* view model                                                          */
/* ------------------------------------------------------------------ */

export function onlineModel(o: OnlineState): TableModel | null {
  const room = o.room;
  const g = room?.game;
  if (!room || !g) return null;
  const memberById = new Map(room.members.map((m) => [m.id, m]));
  const viewer = g.you ?? 0;
  const isHost = room.you.isHost;
  const players = g.players.map((p, i) => {
    const seat = g.seats[i];
    const mem = seat.kind === 'human' ? memberById.get(seat.memberId ?? '') : undefined;
    return {
      id: i,
      name: seat.kind === 'bot' ? t('lobby.bot', { n: i + 1 }) : (mem?.name ?? t('lobby.name', { n: i + 1 })),
      bot: seat.kind === 'bot',
      handCount: i === viewer ? g.hand.length : p.handCount,
      wafers: p.wafers,
      protections: p.protections,
      connected: seat.kind === 'bot' ? null : (mem?.connected ?? false),
      covered: seat.kind === 'human' && !!mem && mem.autoplay,
    };
  });
  const curBot = players[g.current].bot || players[g.current].covered;
  let clock: TableModel['clock'] = null;
  if (room.clock && room.phase === 'playing') {
    let at = room.clock.at - o.offset;
    // network latency in the offset estimate must never show more time than the timer allows
    if (room.clock.kind === 'timeout') at = Math.min(at, Date.now() + room.settings.timer * 1000);
    clock = { kind: room.clock.kind, seat: room.clock.seat, at };
  }
  return {
    mode: 'online',
    gameKey: o.gameNo,
    players,
    viewer,
    current: g.current,
    phase: g.phase,
    deckCount: g.deckCount,
    discardCount: g.discard.length,
    finalTurnsLeft: g.finalTurnsLeft,
    result: g.result,
    hand: g.hand,
    handVisible: true,
    canAct: g.legal.length > 0 && !g.result,
    actions: g.legal,
    handoff: null,
    thinking: !g.result && curBot ? g.current : null,
    banner: o.banner,
    log: o.log,
    rev: room.rev,
    clock,
    link: o.link,
    onAction: sendAction,
    onQuit: leaveRoom,
    onPlayAgain: isHost ? playAgain : undefined,
  };
}
