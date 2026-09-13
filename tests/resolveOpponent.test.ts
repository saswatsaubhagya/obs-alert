import { expect, test } from 'vitest';
import { resolveOpponent } from '@/app/control/[token]/resolveOpponent';

test('before typing anything, the stored (localStorage-backed) value is shown', () => {
  expect(resolveOpponent(null, 'Team Red')).toBe('Team Red');
});

test('once the user has typed, the draft wins even if storage never changed', () => {
  // Regression for: a Dock.tsx that fed localStorage.setItem's throw back
  // into the displayed value made the opponent field inert whenever storage
  // was unavailable (private mode, quota, disabled) — every keystroke's
  // write failed silently, the store re-read the old value, and the
  // controlled input snapped back, so the user could not type at all.
  // draft must win regardless of what `stored` says once it is non-null.
  expect(resolveOpponent('Team Blue', 'Team Red')).toBe('Team Blue');
});

test('an empty typed value (deleting all text) still wins over a stale stored value', () => {
  expect(resolveOpponent('', 'Team Red')).toBe('');
});
