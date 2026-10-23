import { useEffect, useState } from 'preact/hooks';
import { chooseAction, type BotLevel } from '../ai';
import { applyAction, createGame, legalActions, type Action, type EndMode, type GameEvent, type GameState } from '../engine';
import { t } from '../i18n';
import type { Banner, LogItem, TableModel } from './model';
import * as sfx from '../audio/sfx';

export type { Banner, LogItem } from './model';

export interface Seat {
  kind: 'human' | 'bot';
  level: BotLevel;
}

export interface Session {
  /** changes for every new game (used as a view key) */
  gameId: number;
  seats: Seat[];
  endMode: EndMode;
  state: GameState;
  log: LogItem[];
  /** seat whose hand is drawn at the bottom of the table */
  viewer: number;
  handVisible: boolean;
  /** hotseat: seat the device must be handed to (hand stays hidden until reveal) */
  handoff: number | null;
  thinking: number | null;
  banner: Banner | null;
  /** incremented on every applied action; lets views react to changes */
  rev: number;
  lastEvents: GameEvent[];
}

let session: Session | null = null;
const listeners = new Set<() => void>();
let logId = 1;
let gameCounter = 1;
let bannerId = 1;
let botTimer: ReturnType<typeof setTimeout> | null = null;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;

export const BOT_DELAY_MS = 950;

function emitChange(): void {
  listeners.forEach((f) => f());
}

export function getSession(): Session | null {
  return session;
}

export function useSession(): Session | null {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return session;
}

function humanSeats(seats: Seat[]): number[] {
  return seats.flatMap((s, i) => (s.kind === 'human' ? [i] : []));
}

function defaultSeed(): number {
  try {
    const q = new URLSearchParams(location.search).get('seed');
    if (q !== null && /^\d+$/.test(q)) return Number(q) >>> 0;
  } catch {
    /* ignore */
  }
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

export function startGame(seats: Seat[], endMode: EndMode, seed = defaultSeed()): void {
  stopTimers();
  const state = createGame({ numPlayers: seats.length, endMode }, seed);
  const humans = humanSeats(seats);
  session = {
    gameId: gameCounter++,
    seats,
    endMode,
    state,
    log: [],
    viewer: humans[0] ?? 0,
    handVisible: humans.length < 2,
    handoff: null,
    thinking: null,
    banner: null,
    rev: 0,
    lastEvents: [],
  };
  pushLog(state.events);
  session.lastEvents = state.events;
  afterChange();
  emitChange();
}

export function quitGame(): void {
  stopTimers();
  session = null;
  emitChange();
}

export function replay(): void {
  if (!session) return;
  startGame(session.seats, session.endMode);
}

function stopTimers(): void {
  if (botTimer) clearTimeout(botTimer);
  if (bannerTimer) clearTimeout(bannerTimer);
  botTimer = null;
  bannerTimer = null;
}

function pushLog(events: GameEvent[]): void {
  if (!session) return;
  const items = events.map((ev) => ({ id: logId++, ev }));
  session.log = [...session.log, ...items].slice(-500);
}

export function playSounds(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'advance':
        sfx.play('advance');
        break;
      case 'regress':
        sfx.play('regress');
        break;
      case 'protect':
        sfx.play('protect');
        break;
      case 'blocked':
        sfx.play('block');
        break;
      case 'draw':
        sfx.play('draw');
        break;
      case 'play':
        sfx.play('play');
        break;
      case 'discard':
        sfx.play('click');
        break;
      case 'gameOver':
        sfx.play('win');
        break;
    }
  }
}

/** Apply an action (human or bot). */
export function dispatch(action: Action): boolean {
  if (!session || session.state.result) return false;
  let next: GameState;
  try {
    next = applyAction(session.state, action);
  } catch {
    sfx.play('error');
    return false;
  }
  const prevCurrent = session.state.current;
  const s = session;
  s.state = next;
  s.rev++;
  s.lastEvents = next.events;
  pushLog(next.events);
  playSounds(next.events);
  const played = next.events.find((e) => e.type === 'play');
  if (played && played.type === 'play') {
    s.banner = { id: bannerId++, actor: played.player, card: played.card.kind, target: played.target };
  } else if (action.type === 'discard') {
    s.banner = null;
  }
  if (bannerTimer) clearTimeout(bannerTimer);
  const myBanner = s.banner?.id;
  if (s.banner) {
    bannerTimer = setTimeout(() => {
      if (session && session.banner?.id === myBanner) {
        session.banner = null;
        emitChange();
      }
    }, 1500);
  }
  s.thinking = null;
  const humans = humanSeats(s.seats);
  if (humans.length >= 2 && next.current !== prevCurrent) s.handVisible = false; // hide while passing
  afterChange();
  emitChange();
  return true;
}

export function revealHand(): void {
  if (!session || session.handoff === null) return;
  session.viewer = session.handoff;
  session.handoff = null;
  session.handVisible = true;
  sfx.play('turn');
  emitChange();
}

/** Decide handoff / bot scheduling after any state change. */
function afterChange(): void {
  const s = session;
  if (!s || s.state.result) {
    if (s) {
      s.thinking = null;
      s.handVisible = true;
      s.handoff = null;
    }
    return;
  }
  const cur = s.state.current;
  const seat = s.seats[cur];
  const humans = humanSeats(s.seats);
  if (seat.kind === 'human') {
    if (humans.length >= 2) {
      if (s.viewer !== cur || !s.handVisible) {
        if (s.handoff !== cur) {
          s.handoff = cur;
          s.handVisible = false;
        }
      }
    } else {
      s.viewer = cur;
      s.handVisible = true;
    }
    return;
  }
  // bot turn
  s.thinking = cur;
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(() => {
    botTimer = null;
    const cs = session;
    if (!cs || cs.state.result || cs.state.current !== cur) return;
    const a = chooseAction(cs.state, cur, cs.seats[cur].level);
    dispatch(a);
  }, BOT_DELAY_MS);
}

/* ------------------------------------------------------------------ */
/* view model                                                          */
/* ------------------------------------------------------------------ */

let actionCache: { gameId: number; rev: number; viewer: number; actions: Action[] } | null = null;

/** Adapter: local hotseat / bot session -> table view model. */
export function localModel(s: Session): TableModel {
  const st = s.state;
  const myTurn = !st.result && st.current === s.viewer && s.seats[s.viewer].kind === 'human' && s.handoff === null && s.handVisible;
  let actions: Action[] = [];
  if (myTurn) {
    if (!actionCache || actionCache.gameId !== s.gameId || actionCache.rev !== s.rev || actionCache.viewer !== s.viewer) {
      actionCache = { gameId: s.gameId, rev: s.rev, viewer: s.viewer, actions: legalActions(st, s.viewer) };
    }
    actions = actionCache.actions;
  }
  return {
    mode: 'local',
    gameKey: s.gameId,
    players: st.players.map((p, i) => ({
      id: i,
      name: t(s.seats[i].kind === 'human' ? 'lobby.name' : 'lobby.bot', { n: i + 1 }),
      bot: s.seats[i].kind === 'bot',
      handCount: p.hand.length,
      wafers: [p.wafers[0], p.wafers[1]],
      protections: p.protections,
      connected: null,
      covered: false,
    })),
    viewer: s.viewer,
    current: st.current,
    phase: st.phase,
    deckCount: st.deck.length,
    discardCount: st.discard.length,
    finalTurnsLeft: st.finalTurnsLeft,
    result: st.result,
    hand: st.players[s.viewer].hand,
    handVisible: s.handVisible,
    canAct: myTurn,
    actions,
    handoff: s.handoff,
    thinking: s.thinking,
    banner: s.banner,
    log: s.log,
    rev: s.rev,
    clock: null,
    onAction: dispatch,
    onQuit: quitGame,
    onReveal: revealHand,
    onPlayAgain: replay,
  };
}
