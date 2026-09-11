// ponytail: fixed-window counter in process memory. Ceiling: limits are per
// instance, and restarts forget them. Upgrade path: Redis INCR with EXPIRE.
type Window = { count: number; resetAt: number };

const g = globalThis as unknown as { __rl?: Map<string, Window> };
const windows: Map<string, Window> = (g.__rl ??= new Map());

export function take(
  bucketId: string,
  limit = 60,
  windowMs = 60_000
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const w = windows.get(bucketId);
  if (!w || now >= w.resetAt) {
    windows.set(bucketId, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (w.count < limit) {
    w.count++;
    return { ok: true };
  }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
}

/** Test-only. */
export function __reset() {
  windows.clear();
}
