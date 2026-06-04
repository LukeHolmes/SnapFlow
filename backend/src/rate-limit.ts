// Per-account token bucket. In-memory for dev; the interface is Redis-ready
// (architecture §9 puts rate-limit counters in Redis under burst).
interface Bucket { tokens: number; updated: number; }
const buckets = new Map<string, Bucket>();

export function allow(key: string, ratePerMin: number): boolean {
  const now = Date.now();
  const refillPerMs = ratePerMin / 60_000;
  const b = buckets.get(key) ?? { tokens: ratePerMin, updated: now };
  b.tokens = Math.min(ratePerMin, b.tokens + (now - b.updated) * refillPerMs);
  b.updated = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

export const _reset = () => buckets.clear(); // test helper
