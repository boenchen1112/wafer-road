import {
  COMPLETE_STEP,
  HAND_SIZE,
  PROCESS_FROM,
  REGRESS_AT,
  WAFERS_PER_PLAYER,
  buildDeck,
  isProcess,
  isProtection,
  isRegression,
  needsPlayerTarget,
} from './cards';
import { shuffleInPlace } from './rng';
import type {
  Action,
  BlockedBy,
  Card,
  CardKind,
  GameConfig,
  GameEvent,
  GameResult,
  GameState,
  PlayerState,
  Target,
} from './types';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const STEP_POINTS = [0, 2, 3, 4, 5];

/** Points a player would score right now (end mode 1 final scoring). */
export function scoreOf(state: GameState, playerId: number): number {
  const p = state.players[playerId];
  let pts = 0;
  for (const w of p.wafers) pts += STEP_POINTS[w];
  pts += p.hand.filter((c) => c.kind === 'yearEndBonus').length;
  return pts;
}

export function isOver(state: GameState): boolean {
  return state.result !== null;
}

export function countKind(cards: Card[], kind: CardKind): number {
  let n = 0;
  for (const c of cards) if (c.kind === kind) n++;
  return n;
}

/** All cards in the game, wherever they are (for conservation checks). */
export function allCards(state: GameState): Card[] {
  const out: Card[] = [...state.deck, ...state.discard];
  for (const p of state.players) out.push(...p.hand, ...p.protections);
  return out;
}

function protectionKindFor(cause: CardKind): BlockedBy {
  return cause === 'blackout' ? 'generator' : 'emergencyExit';
}

/* ------------------------------------------------------------------ */
/* creation                                                            */
/* ------------------------------------------------------------------ */

export function createGame(config: GameConfig, seed: number): GameState {
  if (!Number.isInteger(config.numPlayers) || config.numPlayers < 2 || config.numPlayers > 5) {
    throw new Error('numPlayers must be 2..5');
  }
  const s: GameState = {
    config: { ...config },
    players: [],
    deck: buildDeck(),
    discard: [],
    current: 0,
    phase: 'action',
    finalTurnsLeft: null,
    turnCount: 0,
    rng: seed >>> 0,
    result: null,
    events: [],
  };
  shuffleInPlace(s, s.deck);
  for (let i = 0; i < config.numPlayers; i++) {
    const p: PlayerState = { id: i, hand: [], wafers: [0, 0], protections: [] };
    for (let k = 0; k < HAND_SIZE; k++) p.hand.push(s.deck.pop()!);
    s.players.push(p);
  }
  startTurn(s, 0);
  return s;
}

/* ------------------------------------------------------------------ */
/* mutation helpers (operate on a private draft)                       */
/* ------------------------------------------------------------------ */

function emit(s: GameState, e: GameEvent): void {
  s.events.push(e);
}

function drawCards(s: GameState, pid: number, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0 && s.config.endMode === 'long' && s.discard.length > 0) {
      s.deck = shuffleInPlace(s, s.discard);
      s.discard = [];
      emit(s, { type: 'reshuffle', count: s.deck.length });
    }
    const c = s.deck.pop();
    if (!c) break;
    s.players[pid].hand.push(c);
    drawn++;
  }
  if (drawn > 0) emit(s, { type: 'draw', player: pid, count: drawn });
  checkFinalTrigger(s);
  return drawn;
}

function checkFinalTrigger(s: GameState): void {
  if (s.config.endMode === 'timed' && s.deck.length === 0 && s.finalTurnsLeft === null && !s.result) {
    s.finalTurnsLeft = s.players.length;
    emit(s, { type: 'finalRound' });
  }
}

function startTurn(s: GameState, depth: number): void {
  s.phase = 'action';
  emit(s, { type: 'turnStart', player: s.current });
  drawCards(s, s.current, 1);
  if (s.players[s.current].hand.length === 0) {
    // Cannot act at all (should be practically unreachable): pass the turn.
    if (depth >= s.players.length) {
      finishByScore(s);
      return;
    }
    endTurn(s, depth + 1);
  }
}

function endTurn(s: GameState, depth = 0): void {
  if (s.result) return;
  if (s.finalTurnsLeft !== null) {
    if (s.finalTurnsLeft <= 0) {
      finishByScore(s);
      return;
    }
    s.finalTurnsLeft--;
  }
  s.current = (s.current + 1) % s.players.length;
  s.turnCount++;
  startTurn(s, depth);
}

function finishByScore(s: GameState): void {
  const scores = s.players.map((_, i) => scoreOf(s, i));
  const best = Math.max(...scores);
  const winners = scores.flatMap((v, i) => (v === best ? [i] : []));
  s.result = { winners, reason: 'score', scores };
  emit(s, { type: 'gameOver', result: s.result });
}

function finishByCompletion(s: GameState, winner: number): void {
  const scores = s.players.map((_, i) => scoreOf(s, i));
  const result: GameResult = { winners: [winner], reason: 'complete', scores };
  s.result = result;
  emit(s, { type: 'gameOver', result });
}

function takeFromHand(p: PlayerState, cardId: number): Card {
  const i = p.hand.findIndex((c) => c.id === cardId);
  return p.hand.splice(i, 1)[0];
}

function regressAll(s: GameState, pid: number, cause: CardKind, actor: number): void {
  const p = s.players[pid];
  let changed = false;
  for (let w = 0; w < WAFERS_PER_PLAYER; w++) {
    const from = p.wafers[w];
    if (from > 0 && from < COMPLETE_STEP) {
      p.wafers[w] = from - 1;
      changed = true;
      emit(s, { type: 'regress', player: pid, wafer: w as 0 | 1, from, to: from - 1, cause, by: actor });
    }
  }
  if (!changed) emit(s, { type: 'noEffect', player: pid, cause, actor });
}

/** Consume one protection of the matching type if present. */
function tryBlock(s: GameState, pid: number, cause: CardKind, actor: number): boolean {
  const need = protectionKindFor(cause);
  const p = s.players[pid];
  const i = p.protections.findIndex((c) => c.kind === need);
  if (i < 0) return false;
  s.discard.push(p.protections.splice(i, 1)[0]);
  emit(s, { type: 'blocked', player: pid, by: need, cause, actor });
  return true;
}

/* ------------------------------------------------------------------ */
/* validation + legal actions                                          */
/* ------------------------------------------------------------------ */

export function checkAction(s: GameState, a: Action): string | null {
  if (s.result) return 'game over';
  if (a.player !== s.current) return 'not your turn';
  const p = s.players[a.player];
  const card = p.hand.find((c) => c.id === a.cardId);
  if (!card) return 'card not in hand';
  if (a.type === 'discard') return null;
  if (s.phase === 'bonusDiscard') return 'must discard';
  const k = card.kind;
  if (k === 'yearEndBonus' && s.phase === 'bonus') return 'no nested bonus';
  const t = a.target;
  if (isProtection(k) || k === 'blackout' || k === 'yearEndBonus') {
    return t ? 'unexpected target' : null;
  }
  if (!t) return 'target required';
  if (!Number.isInteger(t.player) || t.player < 0 || t.player >= s.players.length) return 'bad target player';
  if (needsPlayerTarget(k)) {
    if (t.wafer !== undefined) return 'unexpected wafer';
    if (t.player === a.player) return 'cannot target self';
    const tp = s.players[t.player];
    if (k === 'rookieEngineer' && !tp.protections.some((c) => c.kind === 'generator')) return 'no generator';
    if (k === 'blockedExit' && !tp.protections.some((c) => c.kind === 'emergencyExit')) return 'no exit';
    return null;
  }
  if (t.wafer !== 0 && t.wafer !== 1) return 'wafer required';
  const step = s.players[t.player].wafers[t.wafer];
  if (isProcess(k)) {
    if (t.player !== a.player) return 'own wafer only';
    if (k === 'foundry') return step < COMPLETE_STEP ? null : 'wafer complete';
    return PROCESS_FROM[k] === step ? null : 'wrong step';
  }
  if (isRegression(k)) return REGRESS_AT[k] === step ? null : 'wrong step';
  return 'unknown card';
}

export function legalActions(s: GameState, playerId: number): Action[] {
  if (s.result || playerId !== s.current) return [];
  const p = s.players[playerId];
  const out: Action[] = [];
  const consider = (a: Action) => {
    if (checkAction(s, a) === null) out.push(a);
  };
  for (const c of p.hand) {
    consider({ type: 'discard', player: playerId, cardId: c.id });
    if (s.phase === 'bonusDiscard') continue;
    const k = c.kind;
    if (isProtection(k) || k === 'blackout' || k === 'yearEndBonus') {
      consider({ type: 'play', player: playerId, cardId: c.id });
    } else if (needsPlayerTarget(k)) {
      for (const q of s.players) {
        consider({ type: 'play', player: playerId, cardId: c.id, target: { player: q.id } });
      }
    } else if (isProcess(k)) {
      for (const w of [0, 1] as const) {
        consider({ type: 'play', player: playerId, cardId: c.id, target: { player: playerId, wafer: w } });
      }
    } else {
      for (const q of s.players) {
        for (const w of [0, 1] as const) {
          consider({ type: 'play', player: playerId, cardId: c.id, target: { player: q.id, wafer: w } });
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* applying actions                                                    */
/* ------------------------------------------------------------------ */

/** Pure: returns a new state; the input is never mutated. Throws on illegal actions. */
export function applyAction(state: GameState, action: Action): GameState {
  const err = checkAction(state, action);
  if (err) throw new Error(`Illegal action: ${err}`);
  const s = structuredClone(state);
  s.events = [];
  const p = s.players[action.player];
  const wasPhase = s.phase;

  if (action.type === 'discard') {
    const card = takeFromHand(p, action.cardId);
    s.discard.push(card);
    emit(s, { type: 'discard', player: action.player, card });
    advanceAfter(s, wasPhase);
    return s;
  }

  const card = takeFromHand(p, action.cardId);
  const target: Target | undefined = action.target ? { ...action.target } : undefined;
  emit(s, { type: 'play', player: action.player, card, target });
  const k = card.kind;

  if (isProtection(k)) {
    p.protections.push(card);
    emit(s, { type: 'protect', player: action.player, card });
  } else {
    s.discard.push(card);
    if (isProcess(k)) {
      const w = target!.wafer!;
      const from = p.wafers[w];
      p.wafers[w] = from + 1;
      emit(s, { type: 'advance', player: action.player, wafer: w, from, to: from + 1 });
      if (p.wafers[w] >= COMPLETE_STEP) {
        finishByCompletion(s, action.player);
        return s;
      }
    } else if (isRegression(k)) {
      const tp = s.players[target!.player];
      const w = target!.wafer!;
      const from = tp.wafers[w];
      tp.wafers[w] = from - 1;
      emit(s, { type: 'regress', player: tp.id, wafer: w, from, to: from - 1, cause: k, by: action.player });
    } else if (k === 'blackout') {
      for (const q of s.players) {
        if (!tryBlock(s, q.id, k, action.player)) regressAll(s, q.id, k, action.player);
      }
    } else if (k === 'toxicGas') {
      if (!tryBlock(s, target!.player, k, action.player)) regressAll(s, target!.player, k, action.player);
    } else if (k === 'rookieEngineer' || k === 'blockedExit') {
      const tp = s.players[target!.player];
      const need: CardKind = k === 'rookieEngineer' ? 'generator' : 'emergencyExit';
      const i = tp.protections.findIndex((c) => c.kind === need);
      const lost = tp.protections.splice(i, 1)[0];
      s.discard.push(lost);
      emit(s, { type: 'loseProtection', player: tp.id, card: lost, cause: k, actor: action.player });
    } else if (k === 'yearEndBonus') {
      drawCards(s, action.player, 2);
      s.phase = 'bonus';
      return s; // the turn continues
    }
  }
  advanceAfter(s, wasPhase);
  return s;
}

function advanceAfter(s: GameState, wasPhase: GameState['phase']): void {
  if (s.result) return;
  const handLen = s.players[s.current].hand.length;
  if (wasPhase === 'action') {
    endTurn(s);
  } else if (handLen > HAND_SIZE) {
    s.phase = 'bonusDiscard';
  } else {
    endTurn(s);
  }
}
