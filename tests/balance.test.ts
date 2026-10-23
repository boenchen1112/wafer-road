// Deck balance report. Skipped in `npm test`; run with `npm run balance`.
import { describe, it } from 'vitest';
import { DECK_COUNTS, PRINTED_DECK_COUNTS, type DeckCounts } from '../src/engine';
import { evalDeck } from '../scripts/balance/evalDeck';

const pNone = (T: number, L: number, k: number) => {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (T - L - i) / (T - i);
  return p;
};
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function report(name: string, c: DeckCounts) {
  const T = Object.values(c).reduce((a, b) => a + b, 0);
  const L = c.thinFilm + c.foundry;
  console.log(`\n${name}: ${T} cards, no level-1 card in opening hand ${pct(pNone(T, L, 4))}, in first 6 cards ${pct(pNone(T, L, 6))}`);
  for (const np of [2, 3, 4, 5]) {
    const m = evalDeck(c, np, np === 3 || np === 4 ? 500 : 300, 777);
    const spread = Math.max(...m.seatWin) - Math.min(...m.seatWin);
    console.log(`  ${np}p  ended by finished wafer ${pct(m.endByWafer)}  turns/player ${m.turns.toFixed(1)}  seat win spread ${pct(spread)}`);
  }
}

describe.skipIf(!(globalThis as any).process?.env?.BALANCE)('deck balance', () => {
  it('printed vs current deck', () => {
    report('Printed deck', PRINTED_DECK_COUNTS);
    report('Current deck', DECK_COUNTS);
  });
});
