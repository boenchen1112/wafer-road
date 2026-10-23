/** mulberry32 with the state kept as a plain uint32 so it can live inside GameState. */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(holder: { rng: number }, n: number): number {
  return Math.floor(nextRandom(holder) * n);
}

/** In-place Fisher-Yates shuffle using the state RNG. */
export function shuffleInPlace<T>(holder: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Stand-alone seeded generator for bots / tests. */
export function seededRandom(seed: number): () => number {
  const h = { rng: seed >>> 0 };
  return () => nextRandom(h);
}
