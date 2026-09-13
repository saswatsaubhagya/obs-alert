import { expect, test } from 'vitest';
import { validatePayload } from '@/lib/validate';
import { BUILT_IN } from '@/lib/eventTypes';

const donation = BUILT_IN.donation.fields;

test('rejects non-objects', () => {
  for (const bad of [null, undefined, 'x', 42, [{ name: 'a' }]]) {
    expect(validatePayload(donation, bad).ok).toBe(false);
  }
});

test('accepts a valid payload and drops unknown keys', () => {
  const r = validatePayload(donation, { name: 'bob', amount: 500, currency: 'INR', evil: 'x' });
  expect(r).toEqual({ ok: true, values: { name: 'bob', amount: 500, currency: 'INR' } });
});

test('names the first missing required field', () => {
  const r = validatePayload(donation, { name: 'bob' });
  expect(r).toEqual({ ok: false, error: 'field "amount" required' });
});

test('treats blank and whitespace-only strings as missing', () => {
  expect(validatePayload(donation, { name: '   ', amount: 1 })).toEqual({
    ok: false,
    error: 'field "name" required',
  });
});

test('trims string values', () => {
  const r = validatePayload(donation, { name: '  bob  ', amount: 1 });
  expect(r.ok && r.values.name).toBe('bob');
});

test('coerces numeric strings, rejects non-numeric ones', () => {
  expect(validatePayload(donation, { name: 'bob', amount: '500' })).toEqual({
    ok: true,
    values: { name: 'bob', amount: 500 },
  });
  expect(validatePayload(donation, { name: 'bob', amount: 'lots' })).toEqual({
    ok: false,
    error: 'field "amount" must be a number',
  });
  expect(validatePayload(donation, { name: 'bob', amount: Infinity }).ok).toBe(false);
});

test('omits absent optional fields rather than defaulting them', () => {
  const r = validatePayload(donation, { name: 'bob', amount: 1 });
  expect(r.ok && 'message' in r.values).toBe(false);
});

test('keeps donor text verbatim — escaping is the renderer and overlay job', () => {
  const r = validatePayload(donation, { name: '<script>alert(1)</script>', amount: 1 });
  expect(r.ok && r.values.name).toBe('<script>alert(1)</script>');
});

const win = BUILT_IN.win.fields;

test('a win payload with both optional fields absent is valid', () => {
  expect(validatePayload(win, {})).toEqual({ ok: true, values: {} });
});

test('a numeric opponent is coerced to its string form, an object or array opponent is rejected', () => {
  expect(validatePayload(win, { opponent: 42 })).toEqual({ ok: true, values: { opponent: '42' } });
  expect(validatePayload(win, { opponent: { name: 'x' } })).toEqual({
    ok: false,
    error: 'field "opponent" must be a string',
  });
  expect(validatePayload(win, { opponent: ['x'] })).toEqual({
    ok: false,
    error: 'field "opponent" must be a string',
  });
});
