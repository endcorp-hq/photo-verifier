export type TimedCache<T> = {
  ts: number;
  out: T;
} | null;

export function readFreshCache<T>(cache: TimedCache<T>, ttlMs: number): T | null {
  if (!cache) return null;
  if (Date.now() - cache.ts >= ttlMs) return null;
  return cache.out;
}

export function writeTimedCache<T>(value: T): TimedCache<T> {
  return { ts: Date.now(), out: value };
}
