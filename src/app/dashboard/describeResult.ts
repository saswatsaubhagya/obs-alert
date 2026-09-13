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
  // The real status, not a hardcoded 400: the control dock also sees 401, 413,
  // 429 and 500. Identical output for the dashboard's only failure case.
  return `${r.status} — ${(r.body as { error: string }).error}`;
}
