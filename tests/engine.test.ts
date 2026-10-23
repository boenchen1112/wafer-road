import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE,
  allCards,
  applyAction,
  checkAction,
  countKind,
  createGame,
  legalActions,
  scoreOf,
  type Action,
  type Target,
  type CardKind,
  type GameState,
} from '../src/engine';
import { cardOf, scenario } from './helpers';

const play = (s: GameState, pid: number, kind: CardKind, target?: Target) =>
  applyAction(s, { type: 'play', player: pid, cardId: cardOf(s, pid, kind).id, target });

const FILL: CardKind[] = ['yearEndBonus', 'yearEndBonus', 'yearEndBonus', 'blockedExit'];

describe('setup', () => {
  it('deals 4 cards, then current player draws to 5; deck has 68 cards total', () => {
    for (let n = 2; n <= 5; n++) {
      const s = createGame({ numPlayers: n, endMode: 'timed' }, 42);
      expect(allCards(s)).toHaveLength(DECK_SIZE);
      expect(DECK_SIZE).toBe(68);
      s.players.forEach((p, i) => {
        expect(p.wafers).toEqual([0, 0]);
        expect(p.hand).toHaveLength(i === 0 ? 5 : 4);
      });
      expect(s.deck).toHaveLength(68 - 4 * n - 1);
    }
  });
  it('is deterministic per seed and differs between seeds', () => {
    const a = createGame({ numPlayers: 3, endMode: 'timed' }, 7);
    const b = createGame({ numPlayers: 3, endMode: 'timed' }, 7);
    const c = createGame({ numPlayers: 3, endMode: 'timed' }, 8);
    expect(a).toEqual(b);
    expect(a.players[0].hand.map((x) => x.id)).not.toEqual(c.players[0].hand.map((x) => x.id));
  });
  it('rejects bad player counts', () => {
    expect(() => createGame({ numPlayers: 1, endMode: 'timed' }, 1)).toThrow();
    expect(() => createGame({ numPlayers: 6, endMode: 'timed' }, 1)).toThrow();
  });
  it('applyAction does not mutate its input', () => {
    const s = scenario({ hands: { 0: ['thinFilm', ...FILL] } });
    const snap = structuredClone(s);
    play(s, 0, 'thinFilm', { player: 0, wafer: 0 });
    expect(s).toEqual(snap);
  });
});

describe('process cards', () => {
  const chain: [CardKind, number][] = [
    ['thinFilm', 0],
    ['photolithography', 1],
    ['doping', 2],
  ];
  for (const [kind, from] of chain) {
    it(`${kind} advances step ${from} -> ${from + 1} on own wafer only`, () => {
      const s = scenario({ hands: { 0: [kind, ...FILL] }, wafers: { 0: [from, 0] } });
      const n = play(s, 0, kind, { player: 0, wafer: 0 });
      expect(n.players[0].wafers).toEqual([from + 1, 0]);
      expect(n.discard.some((c) => c.kind === kind)).toBe(true);
      expect(n.current).toBe(1);
    });
    it(`${kind} is illegal on the wrong step, other wafer, or another player`, () => {
      const s = scenario({ hands: { 0: [kind, ...FILL] }, wafers: { 0: [from, from + 1], 1: [from, from] } });
      const id = cardOf(s, 0, kind).id;
      expect(checkAction(s, { type: 'play', player: 0, cardId: id, target: { player: 0, wafer: 1 } })).not.toBeNull();
      expect(checkAction(s, { type: 'play', player: 0, cardId: id, target: { player: 1, wafer: 0 } })).not.toBeNull();
      expect(checkAction(s, { type: 'play', player: 0, cardId: id, target: { player: 0, wafer: 0 } })).toBeNull();
    });
  }
  it('metallization completes a wafer and wins immediately', () => {
    const s = scenario({ hands: { 0: ['metallization', ...FILL] }, wafers: { 0: [3, 0] } });
    const n = play(s, 0, 'metallization', { player: 0, wafer: 0 });
    expect(n.players[0].wafers[0]).toBe(4);
    expect(n.result).toMatchObject({ winners: [0], reason: 'complete' });
    expect(legalActions(n, 1)).toEqual([]);
    expect(() => applyAction(n, { type: 'discard', player: 1, cardId: n.players[1].hand[0].id })).toThrow();
  });
  it('foundry is wild: works on whichever step the chosen wafer needs, not on a complete wafer', () => {
    for (const step of [0, 1, 2]) {
      const s = scenario({ hands: { 0: ['foundry', ...FILL] }, wafers: { 0: [step, 0] } });
      const n = play(s, 0, 'foundry', { player: 0, wafer: 0 });
      expect(n.players[0].wafers[0]).toBe(step + 1);
    }
    const s = scenario({ hands: { 0: ['foundry', ...FILL] }, wafers: { 0: [3, 0] } });
    expect(play(s, 0, 'foundry', { player: 0, wafer: 0 }).result?.winners).toEqual([0]);
    const legal = legalActions(s, 0).filter((a) => a.type === 'play' && a.cardId === cardOf(s, 0, 'foundry').id);
    expect(legal).toHaveLength(2);
  });
});

describe('regression cards', () => {
  const regs: [CardKind, number][] = [
    ['agingEquipment', 1],
    ['exposureError', 2],
    ['ionImplant', 3],
  ];
  for (const [kind, at] of regs) {
    it(`${kind} sends exactly step ${at} -> ${at - 1} on an opponent`, () => {
      const s = scenario({ hands: { 0: [kind, ...FILL] }, wafers: { 1: [at, 0] } });
      const n = play(s, 0, kind, { player: 1, wafer: 0 });
      expect(n.players[1].wafers).toEqual([at - 1, 0]);
    });
    it(`${kind} may target your own wafer`, () => {
      const s = scenario({ hands: { 0: [kind, ...FILL] }, wafers: { 0: [0, at] } });
      const n = play(s, 0, kind, { player: 0, wafer: 1 });
      expect(n.players[0].wafers).toEqual([0, at - 1]);
    });
    it(`${kind} is illegal on any other step, including completed wafers`, () => {
      for (let step = 0; step <= 4; step++) {
        if (step === at) continue;
        const s = scenario({ hands: { 0: [kind, ...FILL] }, wafers: { 1: [step, 0] } });
        const a: Action = { type: 'play', player: 0, cardId: cardOf(s, 0, kind).id, target: { player: 1, wafer: 0 } };
        expect(checkAction(s, a)).not.toBeNull();
        expect(() => applyAction(s, a)).toThrow();
      }
    });
    it(`${kind} ignores protections (only events are blocked)`, () => {
      const s = scenario({
        hands: { 0: [kind, ...FILL] },
        wafers: { 1: [at, 0] },
        protections: { 1: ['generator', 'emergencyExit'] },
      });
      const n = play(s, 0, kind, { player: 1, wafer: 0 });
      expect(n.players[1].wafers[0]).toBe(at - 1);
      expect(n.players[1].protections).toHaveLength(2);
    });
  }
});

describe('protection cards', () => {
  it('generator and emergency exit are placed face-up and stack', () => {
    let s = scenario({ hands: { 0: ['generator', 'generator', 'emergencyExit', 'yearEndBonus', 'blockedExit'] } });
    s = play(s, 0, 'generator');
    expect(s.players[0].protections.map((c) => c.kind)).toEqual(['generator']);
    s = { ...s, current: 0 };
    s = play(s, 0, 'generator');
    s = { ...s, current: 0 };
    s = play(s, 0, 'emergencyExit');
    expect(countKind(s.players[0].protections, 'generator')).toBe(2);
    expect(countKind(s.players[0].protections, 'emergencyExit')).toBe(1);
    expect(s.discard).toHaveLength(0);
  });
});

describe('大停電 blackout', () => {
  it('hits every player including the player, skipping completed wafers and min 0', () => {
    const s = scenario({
      players: 3,
      hands: { 0: ['blackout', ...FILL] },
      wafers: { 0: [2, 0], 1: [3, 1], 2: [1, 2] },
    });
    const n = play(s, 0, 'blackout');
    expect(n.players[0].wafers).toEqual([1, 0]);
    expect(n.players[1].wafers).toEqual([2, 0]);
    expect(n.players[2].wafers).toEqual([0, 1]);
  });
  it('a generator holder discards exactly one generator and is unaffected; others still regress', () => {
    const s = scenario({
      players: 3,
      hands: { 0: ['blackout', ...FILL] },
      wafers: { 0: [2, 2], 1: [2, 2], 2: [2, 2] },
      protections: { 1: ['generator', 'generator'], 0: ['generator'] },
    });
    const n = play(s, 0, 'blackout');
    expect(n.players[0].wafers).toEqual([2, 2]); // the caller's own generator protects
    expect(n.players[0].protections).toHaveLength(0);
    expect(n.players[1].wafers).toEqual([2, 2]);
    expect(countKind(n.players[1].protections, 'generator')).toBe(1);
    expect(n.players[2].wafers).toEqual([1, 1]);
    expect(n.events.filter((e) => e.type === 'blocked')).toHaveLength(2);
    expect(allCards(n)).toHaveLength(68);
  });
  it('emergency exits do not stop a blackout', () => {
    const s = scenario({ hands: { 0: ['blackout', ...FILL] }, wafers: { 1: [2, 0] }, protections: { 1: ['emergencyExit'] } });
    const n = play(s, 0, 'blackout');
    expect(n.players[1].wafers).toEqual([1, 0]);
    expect(n.players[1].protections).toHaveLength(1);
  });
  it('completed wafers are unaffected', () => {
    const s = scenario({ hands: { 0: ['blackout', ...FILL] }, wafers: { 1: [4, 3] } });
    const n = play(s, 0, 'blackout');
    expect(n.players[1].wafers).toEqual([4, 2]);
  });
});

describe('毒氣外洩 toxic gas', () => {
  it('moves all of the target\'s wafers back one step', () => {
    const s = scenario({ hands: { 0: ['toxicGas', ...FILL] }, wafers: { 1: [3, 1], 2: [3, 3] } });
    const n = play(s, 0, 'toxicGas', { player: 1 });
    expect(n.players[1].wafers).toEqual([2, 0]);
    expect(n.players[2].wafers).toEqual([3, 3]);
    expect(n.players[0].wafers).toEqual([0, 0]);
  });
  it('an emergency exit blocks it and is discarded (only one)', () => {
    const s = scenario({
      hands: { 0: ['toxicGas', ...FILL] },
      wafers: { 1: [3, 1] },
      protections: { 1: ['emergencyExit', 'emergencyExit', 'generator'] },
    });
    const n = play(s, 0, 'toxicGas', { player: 1 });
    expect(n.players[1].wafers).toEqual([3, 1]);
    expect(countKind(n.players[1].protections, 'emergencyExit')).toBe(1);
    expect(countKind(n.players[1].protections, 'generator')).toBe(1);
    expect(n.events.some((e) => e.type === 'blocked' && e.by === 'emergencyExit')).toBe(true);
  });
  it('a generator does not block it', () => {
    const s = scenario({ hands: { 0: ['toxicGas', ...FILL] }, wafers: { 1: [3, 0] }, protections: { 1: ['generator'] } });
    expect(play(s, 0, 'toxicGas', { player: 1 }).players[1].wafers).toEqual([2, 0]);
  });
  it('cannot target yourself', () => {
    const s = scenario({ hands: { 0: ['toxicGas', ...FILL] } });
    expect(checkAction(s, { type: 'play', player: 0, cardId: cardOf(s, 0, 'toxicGas').id, target: { player: 0 } })).not.toBeNull();
  });
});

describe('disasters', () => {
  it('新進工程師 removes one generator; requires the target to have one', () => {
    const s = scenario({
      hands: { 0: ['rookieEngineer', ...FILL] },
      protections: { 1: ['generator', 'generator', 'emergencyExit'] },
    });
    const n = play(s, 0, 'rookieEngineer', { player: 1 });
    expect(countKind(n.players[1].protections, 'generator')).toBe(1);
    expect(countKind(n.players[1].protections, 'emergencyExit')).toBe(1);
    expect(checkAction(s, { type: 'play', player: 0, cardId: cardOf(s, 0, 'rookieEngineer').id, target: { player: 2 } })).not.toBeNull();
  });
  it('通道阻塞 removes one emergency exit; requires the target to have one', () => {
    const s = scenario({
      hands: { 0: ['blockedExit', ...FILL] },
      protections: { 1: ['emergencyExit', 'generator'] },
    });
    const n = play(s, 0, 'blockedExit', { player: 1 });
    expect(countKind(n.players[1].protections, 'emergencyExit')).toBe(0);
    expect(countKind(n.players[1].protections, 'generator')).toBe(1);
    expect(checkAction(s, { type: 'play', player: 0, cardId: cardOf(s, 0, 'blockedExit').id, target: { player: 2 } })).not.toBeNull();
  });
});

describe('年終獎金 bonus', () => {
  const setup = () =>
    scenario({
      hands: { 0: ['yearEndBonus', 'thinFilm', 'blackout', 'generator', 'agingEquipment'] },
      deckTop: ['photolithography', 'doping'],
    });
  it('draws 2, keeps the turn, and (a) play then discard returns the hand to 4', () => {
    let s = play(setup(), 0, 'yearEndBonus');
    expect(s.current).toBe(0);
    expect(s.phase).toBe('bonus');
    expect(s.players[0].hand).toHaveLength(6);
    s = play(s, 0, 'thinFilm', { player: 0, wafer: 0 });
    expect(s.phase).toBe('bonusDiscard');
    expect(s.current).toBe(0);
    expect(legalActions(s, 0).every((a) => a.type === 'discard')).toBe(true);
    s = applyAction(s, { type: 'discard', player: 0, cardId: s.players[0].hand[0].id });
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.current).toBe(1);
    expect(allCards(s)).toHaveLength(68);
  });
  it('(b) discard 2 returns the hand to 4', () => {
    let s = play(setup(), 0, 'yearEndBonus');
    s = applyAction(s, { type: 'discard', player: 0, cardId: s.players[0].hand[0].id });
    expect(s.phase).toBe('bonusDiscard');
    s = applyAction(s, { type: 'discard', player: 0, cardId: s.players[0].hand[0].id });
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.current).toBe(1);
  });
  it('cannot chain another bonus inside a bonus', () => {
    const s0 = scenario({ hands: { 0: ['yearEndBonus', 'yearEndBonus', 'thinFilm', 'blackout', 'generator'] } });
    const s = play(s0, 0, 'yearEndBonus');
    const bonusId = cardOf(s, 0, 'yearEndBonus').id;
    expect(checkAction(s, { type: 'play', player: 0, cardId: bonusId })).not.toBeNull();
  });
  it('a card played in the bonus step can win the game immediately', () => {
    const s0 = scenario({
      hands: { 0: ['yearEndBonus', 'metallization', 'blackout', 'generator', 'agingEquipment'] },
      wafers: { 0: [3, 0] },
    });
    const s = play(s0, 0, 'yearEndBonus');
    const n = play(s, 0, 'metallization', { player: 0, wafer: 0 });
    expect(n.result?.winners).toEqual([0]);
  });
});

describe('turn flow', () => {
  it('draw 1 -> play/discard 1 -> hand 4; next player draws', () => {
    const s0 = createGame({ numPlayers: 2, endMode: 'timed' }, 3);
    expect(s0.players[0].hand).toHaveLength(5);
    const a = legalActions(s0, 0).find((x) => x.type === 'discard')!;
    const s1 = applyAction(s0, a);
    expect(s1.players[0].hand).toHaveLength(4);
    expect(s1.current).toBe(1);
    expect(s1.players[1].hand).toHaveLength(5);
    expect(legalActions(s1, 0)).toEqual([]);
  });
  it('rejects actions from the wrong player', () => {
    const s = createGame({ numPlayers: 2, endMode: 'timed' }, 3);
    expect(() => applyAction(s, { type: 'discard', player: 1, cardId: s.players[1].hand[0].id })).toThrow();
  });
  it('events/disasters do nothing on draw (drawing a blackout changes no wafer)', () => {
    const s = scenario({ hands: { 0: ['thinFilm', ...FILL], 1: ['generator', 'generator', 'thinFilm', 'thinFilm'] }, wafers: { 1: [2, 2] }, deckTop: ['blackout'] });
    const n = play(s, 0, 'thinFilm', { player: 0, wafer: 0 });
    expect(n.players[1].hand.some((c) => c.kind === 'blackout')).toBe(true);
    expect(n.players[1].wafers).toEqual([2, 2]);
  });
});

describe('end conditions', () => {
  it('timed: deck running out triggers one more turn for every player, no draws, then scoring', () => {
    // deck has exactly 1 card; player 0's turn start already drew nothing in this scenario
    let s = scenario({
      players: 3,
      hands: { 0: ['thinFilm', ...FILL], 1: ['thinFilm', 'toxicGas', 'toxicGas', 'toxicGas'], 2: ['thinFilm', 'blackout', 'blackout', 'blackout'] },
      deckTop: ['generator'],
      emptyDeck: true,
      current: 2,
    });
    // player 2 plays; next player 0 draws the LAST card -> final round triggers
    s = play(s, 2, 'thinFilm', { player: 2, wafer: 0 });
    expect(s.current).toBe(0);
    expect(s.deck).toHaveLength(0);
    expect(s.finalTurnsLeft).toBe(3);
    expect(s.events.some((e) => e.type === 'finalRound')).toBe(true);
    // p0 turn (the trigger turn), then p1, p2, p0 each get one more turn
    const order: number[] = [];
    while (!s.result) {
      order.push(s.current);
      const total = s.players.reduce((n, p) => n + p.hand.length, 0);
      const act = legalActions(s, s.current).find((a) => a.type === 'discard')!;
      s = applyAction(s, act);
      expect(s.players.reduce((n, p) => n + p.hand.length, 0)).toBe(total - 1); // no draws possible
      expect(s.deck).toHaveLength(0);
    }
    expect(order).toEqual([0, 1, 2, 0]);
    expect(s.result.reason).toBe('score');
  });
  it('timed: completing a wafer during the final round still wins immediately', () => {
    const s = scenario({
      hands: { 0: ['metallization', ...FILL] },
      wafers: { 0: [3, 0] },
      emptyDeck: true,
    });
    s.finalTurnsLeft = 2;
    const n = play(s, 0, 'metallization', { player: 0, wafer: 0 });
    expect(n.result).toMatchObject({ reason: 'complete', winners: [0] });
  });
  it('long: empty deck is rebuilt from the discard pile and play continues', () => {
    let s = scenario({
      endMode: 'long',
      hands: { 0: ['thinFilm', 'toxicGas', 'toxicGas', 'toxicGas'] },
      deckTop: ['generator'],
      emptyDeck: true,
      current: 1,
    });
    const discardBefore = s.discard.length;
    s = applyAction(s, { type: 'discard', player: 1, cardId: s.players[1].hand[0].id });
    expect(s.current).toBe(2);
    // player 2 drew the last deck card; deck is now empty but no end triggered
    expect(s.finalTurnsLeft).toBeNull();
    s = applyAction(s, { type: 'discard', player: 2, cardId: s.players[2].hand[0].id });
    // player 0 must draw: reshuffle
    expect(s.events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.result).toBeNull();
    expect(allCards(s)).toHaveLength(68);
    expect(s.deck.length + s.discard.length).toBeGreaterThan(discardBefore - 1);
  });
});

describe('scoring', () => {
  const scored = (wafers: [number, number], bonuses: number) => {
    const hand: CardKind[] = ['thinFilm', 'thinFilm', 'thinFilm', 'thinFilm'];
    for (let i = 0; i < bonuses; i++) hand[i] = 'yearEndBonus';
    const s = scenario({ hands: { 0: hand }, wafers: { 0: wafers } });
    return scoreOf(s, 0);
  };
  it('step 1/2/3 = 2/3/4 points, step 0 = 0, summed across wafers, +1 per bonus in hand', () => {
    expect(scored([0, 0], 0)).toBe(0);
    expect(scored([1, 0], 0)).toBe(2);
    expect(scored([2, 0], 0)).toBe(3);
    expect(scored([3, 0], 0)).toBe(4);
    expect(scored([3, 2], 0)).toBe(7);
    expect(scored([1, 1], 2)).toBe(6);
  });
  it('highest score wins; ties share the win', () => {
    const make = (w: Record<number, [number, number]>, bonus1 = false) => {
      const s = scenario({
        players: 3,
        hands: { 0: ['toxicGas', 'toxicGas', 'toxicGas', 'toxicGas'], 1: bonus1 ? ['yearEndBonus', 'blackout', 'blackout', 'blackout'] : ['blackout', 'blackout', 'blackout', 'blackout'], 2: ['generator', 'generator', 'generator', 'generator'] },
        wafers: w,
        emptyDeck: true,
      });
      s.finalTurnsLeft = 0;
      s.current = 2;
      return applyAction(s, { type: 'discard', player: 2, cardId: s.players[2].hand[0].id });
    };
    const tie = make({ 0: [3, 0], 1: [2, 1], 2: [0, 0] });
    expect(tie.result).toMatchObject({ reason: 'score', scores: [4, 5, 0] });
    const real = make({ 0: [3, 0], 1: [2, 0], 2: [1, 0] });
    expect(real.result!.winners).toEqual([0]);
    const t2 = make({ 0: [2, 0], 1: [1, 0], 2: [0, 0] }, true);
    expect(t2.result!.scores).toEqual([3, 3, 0]);
    expect(t2.result!.winners).toEqual([0, 1]);
  });
});
