import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../src/ai';
import { applyAction, createGame, seededRandom, type Card, type GameState } from '../../src/engine';
import type { LogEntry, SeatView } from '../../src/online/protocol';
import { buildGameView, redactEvent } from '../../src/online/view';
import { HOST_TOKEN, T0, join, newRoom } from './helpers';

const seatsFor = (n: number): SeatView[] => Array.from({ length: n }, () => ({ kind: 'bot', level: 'normal' as const }));

function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  }
  return out;
}

/** Every {id, kind} object reachable in the value. */
function cardsDeep(v: unknown, out: Card[] = []): Card[] {
  if (Array.isArray(v)) v.forEach((x) => cardsDeep(x, out));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'number' && typeof o.kind === 'string') out.push({ id: o.id, kind: o.kind as Card['kind'] });
    for (const x of Object.values(o)) cardsDeep(x, out);
  }
  return out;
}

function logOf(game: GameState, seq: { n: number }): LogEntry[] {
  return game.events.map((ev) => ({ id: ++seq.n, ev }));
}

describe('redaction: no hidden information reaches a client', () => {
  it('view contains only allow-listed keys: no seed, rng, deck order or foreign hands', () => {
    const g = createGame({ numPlayers: 3, endMode: 'timed' }, 12345);
    const view = buildGameView(g, seatsFor(3), 1, [], true);
    const keys = keysDeep(view);
    for (const bad of ['rng', 'seed', 'deck', 'events', 'config']) expect(keys.has(bad)).toBe(false);
    expect(Object.keys(view.players[0]).sort()).toEqual(['handCount', 'protections', 'wafers']);
    expect(JSON.stringify(view)).not.toContain(String(g.rng));
    expect(view.deckCount).toBe(g.deck.length);
    expect(view.hand).toEqual(g.players[1].hand);
    expect(view.players.map((p) => p.handCount)).toEqual(g.players.map((p) => p.hand.length));
  });

  it("never contains another player's hand cards or any deck card (timed game, every step, every viewer)", () => {
    const rand = seededRandom(5);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let g = createGame({ numPlayers: 4, endMode: 'timed' }, seed);
      const seq = { n: 0 };
      let log: LogEntry[] = logOf(g, seq);
      for (let step = 0; step < 400 && !g.result; step++) {
        for (let v = 0; v < 4; v++) {
          const view = buildGameView(g, seatsFor(4), v, log, true);
          const found = new Set(cardsDeep(view).map((c) => c.id));
          const logged = new Set(cardsDeep(view.log).map((c) => c.id));
          const forbidden = [...g.deck.map((c) => c.id), ...g.players.filter((p) => p.id !== v).flatMap((p) => p.hand.map((c) => c.id))];
          for (const id of forbidden) {
            // A card that was publicly played earlier may legitimately appear in the log only
            // (timed games never recycle the discard pile, so hidden cards were never public).
            expect(found.has(id) && !logged.has(id)).toBe(false);
            expect(found.has(id)).toBe(false);
          }
          for (const a of view.legal) expect(g.players[v].hand.some((c) => c.id === a.cardId)).toBe(true);
          expect(view.discard.map((c) => c.id).sort()).toEqual(g.discard.map((c) => c.id).sort());
        }
        const act = chooseAction(g, g.current, step % 3 === 0 ? 'easy' : 'normal', rand);
        g = applyAction(g, act);
        log = [...log, ...logOf(g, seq)];
      }
    }
  });

  it('non-interference: swapping hidden cards, the deck order and the RNG does not change what a viewer receives', () => {
    const rand = seededRandom(11);
    for (const endMode of ['timed', 'long'] as const) {
      let g = createGame({ numPlayers: 4, endMode }, 77);
      const seq = { n: 0 };
      let log: LogEntry[] = logOf(g, seq);
      for (let step = 0; step < 150 && !g.result; step++) {
        for (let v = 0; v < 4; v++) {
          const alt = structuredClone(g);
          // swap every foreign hand card with a deck card, reverse the deck, scramble the rng
          const others = alt.players.filter((p) => p.id !== v);
          let di = 0;
          for (const p of others) {
            for (let i = 0; i < p.hand.length && di < alt.deck.length; i++, di++) {
              [p.hand[i], alt.deck[di]] = [alt.deck[di], p.hand[i]];
            }
          }
          alt.deck.reverse();
          alt.rng = (alt.rng ^ 0xdeadbeef) >>> 0;
          const a = buildGameView(g, seatsFor(4), v, log, true);
          const b = buildGameView(alt, seatsFor(4), v, log, true);
          expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        }
        g = applyAction(g, chooseAction(g, g.current, 'normal', rand));
        log = [...log, ...logOf(g, seq)];
      }
    }
  });

  it('a recipient without a seat receives no hand and no legal actions', () => {
    const g = createGame({ numPlayers: 2, endMode: 'timed' }, 3);
    const v = buildGameView(g, seatsFor(2), null, [], true);
    expect(v.hand).toEqual([]);
    expect(v.legal).toEqual([]);
    expect(v.you).toBeNull();
  });

  it('legal actions are only sent when the viewer may act', () => {
    const g = createGame({ numPlayers: 2, endMode: 'timed' }, 3);
    expect(buildGameView(g, seatsFor(2), 0, [], true).legal.length).toBeGreaterThan(0);
    expect(buildGameView(g, seatsFor(2), 0, [], false).legal).toEqual([]);
    expect(buildGameView(g, seatsFor(2), 1, [], true).legal).toEqual([]); // not their turn
  });

  it('redactEvent rebuilds events from public fields and drops unknown ones', () => {
    const ev = redactEvent({ type: 'draw', player: 1, count: 2, secret: [1, 2, 3] } as never)!;
    expect(ev).toEqual({ type: 'draw', player: 1, count: 2 });
    expect(redactEvent({ type: 'peek', cards: [1] } as never)).toBeNull();
  });

  it('through the Room: each member gets their own hand only, and tokens never appear in any view', () => {
    const c = newRoom({ seats: ['open', 'open', 'normal'] }, T0);
    const g = join(c.room, 'Guest', c.now);
    c.room.start(c.host, c.now);
    const game = c.room.data.game!;
    const hv = c.room.viewFor(c.host, c.now)!;
    const gv = c.room.viewFor(g.id, c.now)!;
    expect(hv.game!.hand).toEqual(game.players[0].hand);
    expect(gv.game!.hand).toEqual(game.players[1].hand);
    for (const view of [hv, gv]) {
      const text = JSON.stringify(view);
      expect(text).not.toContain(HOST_TOKEN);
      expect(text).not.toContain(g.token);
      const ids = new Set(cardsDeep(view.game).map((x) => x.id));
      const bot = game.players[2].hand.map((x) => x.id);
      for (const id of bot) expect(ids.has(id)).toBe(false);
      for (const id of game.deck.map((x) => x.id)) expect(ids.has(id)).toBe(false);
      const keys = keysDeep(view);
      for (const bad of ['rng', 'seed', 'deck', 'token', 'reservedHostToken']) expect(keys.has(bad)).toBe(false);
    }
    // host's view must not contain guest hand cards, and vice versa
    const hostIds = new Set(cardsDeep(hv.game).map((x) => x.id));
    for (const card of game.players[1].hand) expect(hostIds.has(card.id)).toBe(false);
    const guestIds = new Set(cardsDeep(gv.game).map((x) => x.id));
    for (const card of game.players[0].hand) expect(guestIds.has(card.id)).toBe(false);
  });
});
