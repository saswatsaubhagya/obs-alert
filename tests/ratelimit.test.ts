import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { take, __reset } from '@/lib/ratelimit';

beforeEach(() => {
  vi.useFakeTimers();
  __reset();
});
afterEach(() => vi.useRealTimers());

test('allows up to the limit then refuses', () => {
  for (let i = 0; i < 3; i++) expect(take('k1', 3, 60000).ok).toBe(true);
  const denied = take('k1', 3, 60000);
  expect(denied.ok).toBe(false);
  expect(!denied.ok && denied.retryAfter).toBeGreaterThan(0);
});

test('buckets are independent per id', () => {
  take('k1', 1, 60000);
  expect(take('k1', 1, 60000).ok).toBe(false);
  expect(take('k2', 1, 60000).ok).toBe(true);
});

test('refills after the window elapses', () => {
  take('k1', 1, 60000);
  expect(take('k1', 1, 60000).ok).toBe(false);
  vi.advanceTimersByTime(60001);
  expect(take('k1', 1, 60000).ok).toBe(true);
});

test('retryAfter is whole seconds, at least 1', () => {
  take('k1', 1, 60000);
  const d = take('k1', 1, 60000);
  expect(!d.ok && Number.isInteger(d.retryAfter)).toBe(true);
  expect(!d.ok && d.retryAfter).toBeGreaterThanOrEqual(1);
});
