import { expect, test } from 'vitest';
import { describeResult } from '@/app/dashboard/describeResult';

test('a 200 reports how many overlay connections received it', () => {
  expect(describeResult({ status: 200, body: { delivered: 2 } })).toBe(
    '200 — delivered to 2 overlay connection(s)'
  );
});

test('a 202 reports why it was skipped', () => {
  expect(describeResult({ status: 202, body: { skipped: 'disabled' } })).toBe('202 — skipped: disabled');
});

test('a 400 reports the error', () => {
  expect(describeResult({ status: 400, body: { error: 'unknown event type' } })).toBe(
    '400 — unknown event type'
  );
});

test('a non-400 failure reports its own status, not a hardcoded 400', () => {
  expect(describeResult({ status: 401, body: { error: 'invalid control token' } })).toBe(
    '401 — invalid control token'
  );
  expect(describeResult({ status: 429, body: { error: 'rate limit exceeded' } })).toBe(
    '429 — rate limit exceeded'
  );
});
