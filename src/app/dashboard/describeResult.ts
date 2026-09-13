// The shared shape of a send result, formatted the same way by every editor
// that reports one (Editor.tsx, ResultEditor.tsx) so the wording cannot drift.
export function describeResult(r: { status: number; body: unknown }): string {
  if (r.status === 200) {
    const b = r.body as { delivered: number };
    return `200 — delivered to ${b.delivered} overlay connection(s)`;
  }
  if (r.status === 202) {
    const b = r.body as { skipped: string };
    return `202 — skipped: ${b.skipped}`;
  }
  const b = r.body as { error: string };
  return `400 — ${b.error}`;
}
