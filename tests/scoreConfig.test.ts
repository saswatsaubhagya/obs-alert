import { beforeEach, expect, test } from 'vitest';
import { getScore } from '@/lib/score';
import {
  SCORE_DEFAULTS,
  cleanScoreConfig,
  parseScoreConfig,
  saveScoreConfigFor,
} from '@/lib/scoreConfig';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});

test('an empty patch is the defaults, and known fields are kept', () => {
  expect(cleanScoreConfig({})).toEqual({ ok: true, config: SCORE_DEFAULTS });
  const r = cleanScoreConfig({ showLabels: false, winLabel: 'W', pos: 'bottom-right', size: 80 });
  expect(r).toMatchObject({
    ok: true,
    config: { showLabels: false, winLabel: 'W', pos: 'bottom-right', size: 80 },
  });
});

test('unknown keys are dropped rather than spread', () => {
  const r = cleanScoreConfig({ userId: 'someone-else', id: 'x', winLabel: 'W' });
  expect(r.ok).toBe(true);
  if (r.ok) expect(Object.keys(r.config).sort()).toEqual(Object.keys(SCORE_DEFAULTS).sort());
});

test('a CSS-unsafe colour is a 400-shaped refusal', () => {
  for (const bad of [
    { winColor: 'red;background:url(https://evil/x)' },
    { bg: 'url(https://evil/x)' },
    { font: 'a}body{display:none' },
  ]) {
    expect(cleanScoreConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('wrong types and unknown positions are refused', () => {
  for (const bad of [
    { showLabels: 'yes' },
    { winLabel: 3 },
    { size: 'big' },
    { size: Number.NaN },
    { pos: 'middle-left' },
    'not an object',
    [1, 2],
    null,
  ]) {
    expect(cleanScoreConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('sizes are clamped and labels are capped', () => {
  const big = cleanScoreConfig({ size: 9000, winLabel: 'x'.repeat(100), separator: '-----' });
  expect(big.ok).toBe(true);
  if (big.ok) {
    expect(big.config.size).toBe(200);
    expect(big.config.winLabel).toHaveLength(24);
    expect(big.config.separator).toHaveLength(4);
  }
  const small = cleanScoreConfig({ size: 1 });
  if (small.ok) expect(small.config.size).toBe(16);
});

test('a stored row that no longer validates reads as the defaults', () => {
  expect(parseScoreConfig(null)).toEqual(SCORE_DEFAULTS);
  expect(parseScoreConfig({ pos: 'nowhere' })).toEqual(SCORE_DEFAULTS);
});

test('saving stores only the rebuilt object and the overlay reads it back', async () => {
  const { user } = await makeUser();
  const r = await saveScoreConfigFor(user.id, { winLabel: 'W', showLabels: false, userId: 'victim' });
  expect(r.ok).toBe(true);
  const state = await getScore(user.id);
  expect(state.config).toMatchObject({ winLabel: 'W', showLabels: false });
  expect(state.config).not.toHaveProperty('userId');
});

test('a bad config is refused without writing', async () => {
  const { user } = await makeUser();
  const r = await saveScoreConfigFor(user.id, { bg: 'url(https://evil/x)' });
  expect(r).toMatchObject({ ok: false, status: 400 });
  expect((await getScore(user.id)).config).toEqual(SCORE_DEFAULTS);
});
