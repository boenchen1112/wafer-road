import { describe, expect, it } from 'vitest';
import { chooseAction, type BotLevel } from '../src/ai';
import { DECK_SIZE, HAND_SIZE, allCards, applyAction, createGame, legalActions, seededRandom, type EndMode, type GameState } from '../src/engine';

function checkInvariants(s: GameState) {
  const cards = allCards(s);
  if (cards.length !== DECK_SIZE) throw new Error(`card count ${cards.length}`);
  const ids = new Set(cards.map((c) => c.id));
  if (ids.size !== DECK_SIZE) throw new Error('duplicate card');
  for (const p of s.players) {
    for (const w of p.wafers) if (w < 0 || w > 4) throw new Error('wafer range');
    if (p.hand.length > HAND_SIZE + 2) throw new Error('hand too big');
    if (p.protections.some((c) => c.kind !== 'generator' && c.kind !== 'emergencyExit')) throw new Error('bad protection');
  }
  if (s.result) {
    expect(s.result.winners.length).toBeGreaterThan(0);
  }
}

function playOut(seed: number, n: number, mode: EndMode, levels: BotLevel[]) {
  const rand = seededRandom(seed ^ 0x9e3779b9);
  let s = createGame({ numPlayers: n, endMode: mode }, seed);
  let steps = 0;
  while (!s.result) {
    const lvl = levels[s.current % levels.length];
    const a = chooseAction(s, s.current, lvl, rand);
    s = applyAction(s, a);
    checkInvariants(s);
    if (++steps > 20000) throw new Error(`game ${seed} did not terminate`);
    // hand is back to 4 at turn boundaries except for the final-round shrink
    if (!s.result && s.phase === 'action' && mode === 'long') expect(s.players[s.current].hand.length).toBe(HAND_SIZE + 1);
  }
  return s;
}

describe('fuzz', () => {
  it('thousands of random-bot games terminate cleanly with the card count conserved', () => {
    let complete = 0;
    let scored = 0;
    for (let g = 0; g < 3000; g++) {
      const n = 2 + (g % 4);
      const mode: EndMode = g % 3 === 0 ? 'long' : 'timed';
      const s = playOut(g + 1, n, mode, ['easy']);
      if (s.result!.reason === 'complete') complete++;
      else scored++;
    }
    expect(complete + scored).toBe(3000);
    expect(scored).toBeGreaterThan(0);
  }, 120000);

  it('normal bots finish games too, and beat random bots on average', () => {
    let normalWins = 0;
    let games = 0;
    for (let g = 0; g < 200; g++) {
      const s = playOut(10000 + g, 2, 'timed', ['normal', 'easy']);
      games++;
      if (s.result!.winners.includes(0) && s.result!.winners.length === 1) normalWins++;
    }
    for (let g = 0; g < 150; g++) {
      playOut(20000 + g, 2 + (g % 4), g % 2 ? 'long' : 'timed', ['normal']);
    }
    expect(normalWins / games).toBeGreaterThan(0.6);
  }, 120000);

  it('legalActions is never empty for the current player and empty for others', () => {
    for (let g = 0; g < 200; g++) {
      let s = createGame({ numPlayers: 4, endMode: g % 2 ? 'long' : 'timed' }, g);
      const rand = seededRandom(g);
      while (!s.result) {
        expect(legalActions(s, s.current).length).toBeGreaterThan(0);
        expect(legalActions(s, (s.current + 1) % 4)).toEqual([]);
        s = applyAction(s, chooseAction(s, s.current, 'easy', rand));
      }
    }
  });
});
