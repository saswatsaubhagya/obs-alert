import { beforeEach, expect, test } from 'vitest';
import { getTimer } from '@/lib/timer';
import {
  TIMER_DEFAULTS,
  cleanTimerConfig,
  formatClock,
  parseTimerConfig,
  saveTimerConfigFor,
} from '@/lib/timerConfig';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});

test('an empty patch is the defaults, and known fields are kept', () => {
  expect(cleanTimerConfig({})).toEqual({ ok: true, config: TIMER_DEFAULTS });
  const r = cleanTimerConfig({ showLabel: false, label: 'BRB', pos: 'bottom-right', format: 'hh:mm:ss' });
  expect(r).toMatchObject({
    ok: true,
    config: { showLabel: false, label: 'BRB', pos: 'bottom-right', format: 'hh:mm:ss' },
  });
});

test('unknown keys are dropped rather than spread', () => {
  const r = cleanTimerConfig({ userId: 'someone-else', id: 'x', label: 'BRB' });
  expect(r.ok).toBe(true);
  if (r.ok) expect(Object.keys(r.config).sort()).toEqual(Object.keys(TIMER_DEFAULTS).sort());
});

test('a CSS-unsafe colour is a 400-shaped refusal', () => {
  for (const bad of [
    { color: 'red;background:url(https://evil/x)' },
    { warnColor: 'url(https://evil/x)' },
    { font: 'a}body{display:none' },
  ]) {
    expect(cleanTimerConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('wrong types, unknown formats and unknown positions are refused', () => {
  for (const bad of [
    { showLabel: 'yes' },
    { hideAtZero: 1 },
    { label: 3 },
    { size: 'big' },
    { warnAtSec: Number.NaN },
    { format: 'ss' },
    { pos: 'middle-left' },
    'not an object',
    [1, 2],
    null,
  ]) {
    expect(cleanTimerConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('numbers are clamped and text is capped', () => {
  const big = cleanTimerConfig({ size: 9000, warnAtSec: 99999, label: 'x'.repeat(100) });
  expect(big.ok).toBe(true);
  if (big.ok) {
    expect(big.config.size).toBe(200);
    expect(big.config.warnAtSec).toBe(3600);
    expect(big.config.label).toHaveLength(24);
  }
  const small = cleanTimerConfig({ size: 1, warnAtSec: -5 });
  if (small.ok) {
    expect(small.config.size).toBe(16);
    expect(small.config.warnAtSec).toBe(0);
  }
});

test('a stored config that no longer validates reads as the defaults', () => {
  expect(parseTimerConfig(null)).toEqual(TIMER_DEFAULTS);
  expect(parseTimerConfig({ pos: 'nowhere' })).toEqual(TIMER_DEFAULTS);
  expect(parseTimerConfig({ label: 'BRB' })).toMatchObject({ label: 'BRB' });
});

test('saving writes only the rebuilt config, and bad input never reaches the row', async () => {
  const { user } = await makeUser();
  const bad = await saveTimerConfigFor(user.id, { userId: 'someone-else', size: 'big' });
  expect(bad).toMatchObject({ ok: false, status: 400 });
  expect((await getTimer(user.id)).config).toEqual(TIMER_DEFAULTS);

  const ok = await saveTimerConfigFor(user.id, { label: 'BRB', userId: 'someone-else' });
  expect(ok.ok).toBe(true);
  const stored = (await getTimer(user.id)).config;
  expect(stored).toMatchObject({ label: 'BRB' });
  expect(Object.keys(stored).sort()).toEqual(Object.keys(TIMER_DEFAULTS).sort());
});

test('the clock face rounds up, and auto grows an hours field only when needed', () => {
  expect(formatClock(0)).toBe('00:00');
  expect(formatClock(1)).toBe('00:01'); // a partial second is still a second on screen
  expect(formatClock(59_400)).toBe('01:00');
  expect(formatClock(5 * 60_000)).toBe('05:00');
  expect(formatClock(-9000)).toBe('00:00');
  expect(formatClock(3_600_000)).toBe('01:00:00');
  expect(formatClock(3_600_000, 'mm:ss')).toBe('60:00');
  expect(formatClock(5 * 60_000, 'hh:mm:ss')).toBe('00:05:00');
});
