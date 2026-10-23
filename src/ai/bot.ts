/** Bots only use the public engine API (legalActions / applyAction / scoreOf). */
import {
  applyAction,
  countKind,
  isOver,
  legalActions,
  scoreOf,
  type Action,
  type Card,
  type CardKind,
  type GameState,
} from '../engine';

export type BotLevel = 'easy' | 'normal';

export function chooseAction(
  state: GameState,
  playerId: number,
  level: BotLevel,
  rand: () => number = Math.random,
): Action {
  const actions = legalActions(state, playerId);
  if (actions.length === 0) throw new Error('bot has no legal action');
  if (level === 'easy') return actions[Math.floor(rand() * actions.length)];
  return chooseNormal(state, playerId, actions, rand);
}

/* ------------------------------------------------------------------ */
/* Normal bot: one-ply search with a hand-written evaluation           */
/* ------------------------------------------------------------------ */

const STEP_VALUE_UNSAFE = [0, 10, 24, 44, 1000];
const STEP_VALUE_SAFE = [0, 12, 24, 36, 1000];
const STEP_POINTS = [0, 2, 3, 4, 5];

function isSafe(state: GameState, pid: number): boolean {
  const p = state.players[pid];
  return p.protections.some((c) => c.kind === 'generator') && p.protections.some((c) => c.kind === 'emergencyExit');
}

function waferValue(state: GameState, pid: number): number {
  const p = state.players[pid];
  const final = state.finalTurnsLeft !== null || state.deck.length <= 2;
  if (state.config.endMode === 'timed' && final) {
    return p.wafers[0] >= 4 || p.wafers[1] >= 4 ? 1000 : STEP_POINTS[p.wafers[0]] * 10 + STEP_POINTS[p.wafers[1]] * 10;
  }
  const table = isSafe(state, pid) ? STEP_VALUE_SAFE : STEP_VALUE_UNSAFE;
  let v = table[p.wafers[0]] + table[p.wafers[1]];
  // spread bonus when protected, otherwise concentrating on the lead wafer is better
  if (isSafe(state, pid) && p.wafers[0] > 0 && p.wafers[1] > 0) v += 3;
  return v;
}

function holdValue(state: GameState, pid: number, c: Card): number {
  const me = state.players[pid];
  const opps = state.players.filter((q) => q.id !== pid);
  const k: CardKind = c.kind;
  switch (k) {
    case 'thinFilm':
    case 'photolithography':
    case 'doping':
    case 'metallization': {
      const from = { thinFilm: 0, photolithography: 1, doping: 2, metallization: 3 }[k];
      return me.wafers.some((w) => w === from) ? 4 : 1;
    }
    case 'foundry':
      return 5;
    case 'agingEquipment':
    case 'exposureError':
    case 'ionImplant': {
      const at = { agingEquipment: 1, exposureError: 2, ionImplant: 3 }[k];
      return opps.some((q) => q.wafers.includes(at)) ? 2.5 : 0.5;
    }
    case 'generator':
      return countKind(me.protections, 'generator') === 0 ? 3 : 2;
    case 'emergencyExit':
      return countKind(me.protections, 'emergencyExit') === 0 ? 3 : 2;
    case 'yearEndBonus':
      return 3;
    case 'rookieEngineer':
      return opps.some((q) => countKind(q.protections, 'generator') > 0) ? 2 : 0.3;
    case 'blockedExit':
      return opps.some((q) => countKind(q.protections, 'emergencyExit') > 0) ? 2 : 0.3;
    case 'blackout':
    case 'toxicGas':
      return 1.5;
  }
}

function evaluate(state: GameState, me: number): number {
  if (isOver(state)) {
    const r = state.result!;
    if (r.winners.includes(me)) return r.winners.length === 1 ? 1e6 : 5e5;
    return -1e6;
  }
  const p = state.players[me];
  let v = waferValue(state, me);
  v += p.protections.length * 9;
  for (const c of p.hand) v += holdValue(state, me, c);
  // Opponents: care more about whoever leads.
  const lead = state.players
    .filter((q) => q.id !== me)
    .map((q) => ({ id: q.id, best: Math.max(...q.wafers) }));
  const topBest = Math.max(...lead.map((l) => l.best));
  for (const l of lead) {
    const q = state.players[l.id];
    const w = 0.35 + (l.best === topBest ? 0.45 : 0);
    v -= w * (waferValue(state, l.id) + q.protections.length * 6);
  }
  if (state.config.endMode === 'timed' && (state.finalTurnsLeft !== null || state.deck.length <= 2)) {
    v += scoreOf(state, me) * 3;
  }
  return v;
}

function chooseNormal(state: GameState, pid: number, actions: Action[], rand: () => number): Action {
  const base = evaluate(state, pid);
  let best: Action = actions[0];
  let bestScore = -Infinity;
  for (const a of actions) {
    let score: number;
    const card = state.players[pid].hand.find((c) => c.id === a.cardId)!;
    if (a.type === 'play' && card.kind === 'yearEndBonus') {
      // Do not peek at the deck: use a flat heuristic. Better when the hand is weak.
      const weak = state.players[pid].hand.filter((c) => holdValue(state, pid, c) <= 1).length;
      score = base + 2 + weak * 2.5;
    } else {
      score = evaluate(applyAction(state, a), pid);
    }
    score += rand() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
