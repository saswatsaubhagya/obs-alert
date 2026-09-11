// ponytail: in-process fan-out, so alerts only reach overlays connected to THIS
// instance. Ceiling: one Node process. Upgrade path: publish to Redis pub/sub and
// have each instance relay to its own local subscriber set.
type Send = (frame: string) => void;

const g = globalThis as unknown as { __alertHub?: Map<string, Set<Send>> };
const rooms: Map<string, Set<Send>> = (g.__alertHub ??= new Map());

export function subscribe(userId: string, send: Send): () => void {
  let set = rooms.get(userId);
  if (!set) rooms.set(userId, (set = new Set()));
  set.add(send);
  return () => {
    const s = rooms.get(userId);
    if (!s) return;
    s.delete(send);
    if (s.size === 0) rooms.delete(userId);
  };
}

export function publish(userId: string, data: unknown): number {
  const set = rooms.get(userId);
  if (!set || set.size === 0) return 0;
  const frame = `data: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const send of [...set]) {
    try {
      send(frame);
      delivered++;
    } catch {
      set.delete(send); // dead connection; the route's cleanup may not have run yet
    }
  }
  if (set.size === 0) rooms.delete(userId);
  return delivered;
}

export function countFor(userId: string): number {
  return rooms.get(userId)?.size ?? 0;
}

/** Test-only. */
export function __reset() {
  rooms.clear();
}
