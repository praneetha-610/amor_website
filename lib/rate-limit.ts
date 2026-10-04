import "server-only";

/**
 * Sliding-window rate limiter (in-memory, per server instance).
 * Good protection on a single server / container. On serverless (Vercel),
 * each instance has its own memory, so for hard guarantees swap this for
 * Upstash Redis — the signature below is all you need to keep.
 * (Overbooking and duplicates are enforced in the DATABASE, not here.)
 */
const g = globalThis as unknown as { __amorRL?: Map<string, number[]> };
const hits = (g.__amorRL ??= new Map<string, number[]>());

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
