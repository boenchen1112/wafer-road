/** Small, dependency-free request guards: Origin allow-list and token-bucket rate limiting. */

export const DEFAULT_ALLOWED_ORIGINS = ['https://boenchen1112.github.io'];
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/**
 * Browsers always send Origin on WebSocket upgrades and cross-origin POSTs, so a
 * missing Origin is rejected. `extra` is a comma-separated list (env ALLOWED_ORIGINS)
 * for forks that host the client elsewhere.
 */
export function isAllowedOrigin(origin: string | null | undefined, extra?: string): boolean {
  if (!origin) return false;
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  if (LOCAL_ORIGIN_RE.test(origin)) return true;
  if (extra) {
    for (const o of extra.split(',')) if (o.trim() && o.trim() === origin) return true;
  }
  return false;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSec: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now: number, cost = 1): boolean {
    const dt = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Keyed buckets with a hard size cap (in-memory, per isolate; best effort). */
export class KeyedLimiter {
  private map = new Map<string, TokenBucket>();
  constructor(
    private capacity: number,
    private refillPerSec: number,
    private maxKeys = 5000,
  ) {}
  allow(key: string, now: number): boolean {
    let b = this.map.get(key);
    if (!b) {
      if (this.map.size >= this.maxKeys) this.map.delete(this.map.keys().next().value as string);
      b = new TokenBucket(this.capacity, this.refillPerSec, now);
      this.map.set(key, b);
    }
    return b.take(now);
  }
}
