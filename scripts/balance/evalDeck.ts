/** Simulates bot games with a given deck and reports balance metrics (see docs/BALANCE.md). */
import { createGame, applyAction, isOver, seededRandom, DECK_COUNTS, type DeckCounts } from '../../src/engine';
import { chooseAction, type BotLevel } from '../../src/ai';

export interface Metrics { np: number; endByWafer: number; turns: number; noLv1Start: number; stall2: number; seatWin: number[]; games: number }

export function evalDeck(counts: DeckCounts, np: number, games: number, seed0 = 1, levels: BotLevel[] = []): Metrics {
  let complete = 0, turns = 0, noLv1 = 0, stall2 = 0;
  const seatWin = Array(np).fill(0);
  for (let g = 0; g < games; g++) {
    let s = createGame({ numPlayers: np, endMode: 'timed', deckCounts: counts }, seed0 + g * 9973);
    const r = seededRandom(seed0 * 31 + g);
    for (const p of s.players) if (!p.hand.some(c => c.kind === 'thinFilm' || c.kind === 'foundry')) noLv1++;
    let checked = false, steps = 0;
    while (!isOver(s) && steps < 5000) {
      s = applyAction(s, chooseAction(s, s.current, levels[s.current] ?? 'normal', r));
      steps++;
      if (!checked && s.turnCount >= 2 * np) {
        checked = true;
        for (const p of s.players) if (p.wafers[0] === 0 && p.wafers[1] === 0) stall2++;
      }
    }
    if (s.result?.reason === 'complete') complete++;
    turns += s.turnCount / np;
    const w = s.result?.winners ?? [];
    for (const i of w) seatWin[i] += 1 / w.length;
  }
  return { np, games, endByWafer: complete / games, turns: turns / games, noLv1Start: noLv1 / (games * np), stall2: stall2 / (games * np), seatWin: seatWin.map(x => x / games) };
}
export { DECK_COUNTS };
