/** Pure game-engine types. No DOM, no UI concerns. */

export type CardKind =
  | 'thinFilm'
  | 'photolithography'
  | 'doping'
  | 'metallization'
  | 'foundry'
  | 'agingEquipment'
  | 'exposureError'
  | 'ionImplant'
  | 'blackout'
  | 'toxicGas'
  | 'rookieEngineer'
  | 'blockedExit'
  | 'generator'
  | 'emergencyExit'
  | 'yearEndBonus';

export interface Card {
  /** Unique id 0..67 within a game. */
  id: number;
  kind: CardKind;
}

export type EndMode = 'timed' | 'long';

export interface GameConfig {
  /** 2..5 */
  numPlayers: number;
  endMode: EndMode;
}

export type WaferStep = 0 | 1 | 2 | 3 | 4;

export interface PlayerState {
  id: number;
  hand: Card[];
  /** Exactly two wafers; value 4 = complete. */
  wafers: [number, number];
  /** Face-up protection cards (generators / emergency exits). */
  protections: Card[];
}

export type Phase =
  /** Current player must play one card or discard one card. */
  | 'action'
  /** After 年終獎金: play one card (not another bonus) or discard one. */
  | 'bonus'
  /** Discard until the hand is back to HAND_SIZE. */
  | 'bonusDiscard';

export interface GameResult {
  winners: number[];
  reason: 'complete' | 'score';
  scores: number[];
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  current: number;
  phase: Phase;
  /** Number of turns still to be played in the final round (timed mode); null if not triggered. */
  finalTurnsLeft: number | null;
  turnCount: number;
  /** Seeded RNG state (mulberry32). */
  rng: number;
  result: GameResult | null;
  /** Events produced by the most recent applyAction / createGame (for log + animation). */
  events: GameEvent[];
}

export type Target = { player: number; wafer?: 0 | 1 };

export type Action =
  | { type: 'play'; player: number; cardId: number; target?: Target }
  | { type: 'discard'; player: number; cardId: number };

export type BlockedBy = 'generator' | 'emergencyExit';

export type GameEvent =
  | { type: 'turnStart'; player: number }
  | { type: 'draw'; player: number; count: number }
  | { type: 'reshuffle'; count: number }
  | { type: 'play'; player: number; card: Card; target?: Target }
  | { type: 'discard'; player: number; card: Card }
  | { type: 'advance'; player: number; wafer: 0 | 1; from: number; to: number }
  | { type: 'regress'; player: number; wafer: 0 | 1; from: number; to: number; cause: CardKind; by: number }
  | { type: 'protect'; player: number; card: Card }
  | { type: 'blocked'; player: number; by: BlockedBy; cause: CardKind; actor: number }
  | { type: 'loseProtection'; player: number; card: Card; cause: CardKind; actor: number }
  | { type: 'noEffect'; player: number; cause: CardKind; actor: number }
  | { type: 'finalRound' }
  | { type: 'gameOver'; result: GameResult };
