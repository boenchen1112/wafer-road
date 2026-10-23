import { PRINTED_DECK_COUNTS, allCards, createGame, type Card, type CardKind, type EndMode, type GameState } from '../src/engine';

export interface Spec {
  players?: number;
  endMode?: EndMode;
  current?: number;
  hands?: Record<number, CardKind[]>;
  wafers?: Record<number, [number, number]>;
  protections?: Record<number, CardKind[]>;
  /** kinds placed on the TOP of the deck (first = drawn first). */
  deckTop?: CardKind[];
  /** if true, deck is emptied except for deckTop (rest goes to discard) */
  emptyDeck?: boolean;
  phase?: GameState['phase'];
}

/** Build a custom state (on the printed 68-card deck, so fixtures have enough of every kind) while conserving all cards. Players not in `hands` get filler hands. */
export function scenario(spec: Spec = {}, seed = 1): GameState {
  const base = createGame({ numPlayers: spec.players ?? 3, endMode: spec.endMode ?? 'timed', deckCounts: PRINTED_DECK_COUNTS }, seed);
  const s = structuredClone(base);
  const pool: Card[] = allCards(s);
  const take = (kind: CardKind): Card => {
    const i = pool.findIndex((c) => c.kind === kind);
    if (i < 0) throw new Error('pool exhausted for ' + kind);
    return pool.splice(i, 1)[0];
  };
  const hands: Card[][] = s.players.map(() => []);
  const prots: Card[][] = s.players.map(() => []);
  for (const [pid, kinds] of Object.entries(spec.hands ?? {})) for (const k of kinds) hands[+pid].push(take(k));
  for (const [pid, kinds] of Object.entries(spec.protections ?? {})) for (const k of kinds) prots[+pid].push(take(k));
  const top = (spec.deckTop ?? []).map(take);
  // filler: players without an explicit hand keep 4 filler cards drawn from the pool (thin-film-free kinds first)
  for (let i = 0; i < s.players.length; i++) {
    if (!spec.hands || !(i in spec.hands)) {
      while (hands[i].length < 4) hands[i].push(pool.splice(0, 1)[0]);
    }
  }
  s.players.forEach((p, i) => {
    p.hand = hands[i];
    p.protections = prots[i];
    p.wafers = spec.wafers?.[i] ? [...spec.wafers[i]] : [0, 0];
  });
  if (spec.emptyDeck) {
    s.deck = top.reverse();
    s.discard = pool;
  } else {
    s.deck = [...pool, ...top.reverse()];
    s.discard = [];
  }
  s.current = spec.current ?? 0;
  s.phase = spec.phase ?? 'action';
  s.events = [];
  s.finalTurnsLeft = null;
  s.result = null;
  return s;
}

export function cardOf(s: GameState, pid: number, kind: CardKind): Card {
  const c = s.players[pid].hand.find((x) => x.kind === kind);
  if (!c) throw new Error(`player ${pid} has no ${kind}`);
  return c;
}
