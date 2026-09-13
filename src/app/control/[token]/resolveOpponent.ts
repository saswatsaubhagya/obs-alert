// The dock's opponent field must stay typeable even when localStorage throws
// on every write (private mode, quota, storage disabled). `draft` is the
// last value the user actually typed this session; `stored` is whatever
// useSyncExternalStore's snapshot last read back from storage. Once the user
// has typed anything, the displayed value comes from `draft` alone, so a
// failed (or successful but stale) storage round-trip never overwrites what
// is on screen.
export function resolveOpponent(draft: string | null, stored: string): string {
  return draft ?? stored;
}
