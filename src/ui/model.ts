/**
 * View model of the game table. Local games (full GameState in the browser) and
 * online games (redacted per-player view from the server) both produce one, so
 * the table component is written once.
 */
import type { Action, Card, CardKind, GameEvent, GameResult, Phase, Target } from '../engine';

export interface LogItem {
  id: number;
  ev: GameEvent;
}

export interface Banner {
  id: number;
  actor: number;
  card: CardKind;
  target?: Target;
  /** true when this was a discard (face-down information only) */
  discard?: boolean;
}

export interface TablePlayer {
  id: number;
  name: string;
  bot: boolean;
  handCount: number;
  wafers: [number, number];
  protections: Card[];
  /** Online only: socket status. null = not applicable (local / bots). */
  connected: boolean | null;
  /** Online only: a bot is playing this human's seat while they are away. */
  covered: boolean;
}

export interface TableClock {
  kind: 'timeout' | 'takeover' | 'bot';
  seat: number;
  /** Deadline in *local* epoch ms (server offset already applied). */
  at: number;
}

export interface TableModel {
  mode: 'local' | 'online';
  /** Changes for every new game (used as a view key). */
  gameKey: string | number;
  players: TablePlayer[];
  /** Seat drawn at the bottom of the table. */
  viewer: number;
  current: number;
  phase: Phase;
  deckCount: number;
  discardCount: number;
  finalTurnsLeft: number | null;
  result: GameResult | null;
  /** The viewer's hand (ignored while handVisible is false: card backs are drawn instead). */
  hand: Card[];
  handVisible: boolean;
  /** The viewer may act right now. */
  canAct: boolean;
  /** Legal actions for the viewer (empty unless canAct). */
  actions: Action[];
  /** Hotseat: seat the device must be handed to. */
  handoff: number | null;
  thinking: number | null;
  banner: Banner | null;
  log: LogItem[];
  /** Increments on every applied action; lets the view react to changes. */
  rev: number;
  clock: TableClock | null;
  /** Online only: connection state of our own socket. */
  link?: 'connecting' | 'open' | 'reconnecting';
  onAction: (a: Action) => boolean;
  onQuit: () => void;
  onReveal?: () => void;
  /** Absent when the viewer cannot start another game (online non-host). */
  onPlayAgain?: () => void;
}

/** Points for wafers at each step (matches the engine's scoring table). */
const STEP_POINTS = [0, 2, 3, 4, 5];
export function waferPoints(wafers: [number, number]): number {
  return STEP_POINTS[wafers[0]] + STEP_POINTS[wafers[1]];
}
