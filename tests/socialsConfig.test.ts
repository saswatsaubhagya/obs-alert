import { beforeEach, expect, test } from 'vitest';
import {
  MAX_ACCOUNTS,
  SOCIALS_DEFAULTS,
  cleanSocialsConfig,
  getSocialsConfig,
  parseSocialsConfig,
  saveSocialsConfigFor,
} from '@/lib/socialsConfig';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});

test('an empty patch is the defaults, and known fields are kept', () => {
  expect(cleanSocialsConfig({})).toEqual({ ok: true, config: SOCIALS_DEFAULTS });
  const r = cleanSocialsConfig({
    accounts: [{ platform: 'twitch', handle: '@me' }],
    showSec: 3,
    gapSec: 0,
    order: 'random',
    anim: 'pop',
    pos: 'top-right',
  });
  expect(r).toMatchObject({
    ok: true,
    config: {
      accounts: [{ platform: 'twitch', handle: '@me' }],
      showSec: 3,
      gapSec: 0,
      order: 'random',
      anim: 'pop',
      pos: 'top-right',
    },
  });
});

test('unknown keys are dropped rather than spread, on the config and on a row', () => {
  const r = cleanSocialsConfig({
    userId: 'someone-else',
    id: 'x',
    accounts: [{ platform: 'kick', handle: 'me', userId: 'someone-else', url: 'javascript:x' }],
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(Object.keys(r.config).sort()).toEqual(Object.keys(SOCIALS_DEFAULTS).sort());
  expect(r.config.accounts).toEqual([{ platform: 'kick', handle: 'me' }]);
});

test('a CSS-unsafe colour is a 400-shaped refusal', () => {
  for (const bad of [
    { color: 'red;background:url(https://evil/x)' },
    { labelColor: 'url(https://evil/x)' },
    { font: 'a}body{display:none' },
  ]) {
    expect(cleanSocialsConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('wrong types and unknown enum values are refused', () => {
  for (const bad of [
    { showIcon: 'yes' },
    { showSec: 'fast' },
    { gapSec: Number.NaN },
    { size: 'big' },
    { order: 'shuffle' },
    { anim: 'explode' },
    { pos: 'middle-left' },
    { accounts: 'twitch' },
    { accounts: [{ platform: 'myspace', handle: 'me' }] },
    { accounts: [{ platform: 'x', handle: 7 }] },
    { accounts: [null] },
    'not an object',
    null,
    [],
  ]) {
    expect(cleanSocialsConfig(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});

test('blank handles drop out, caps clamp, and the list has a ceiling', () => {
  const r = cleanSocialsConfig({
    accounts: [
      { platform: 'x', handle: '  ' },
      { platform: 'x', handle: '  spaced  ' },
    ],
    showSec: 9999,
    gapSec: -5,
    size: 1,
  });
  expect(r).toEqual({
    ok: true,
    config: { ...SOCIALS_DEFAULTS, accounts: [{ platform: 'x', handle: 'spaced' }], showSec: 120, gapSec: 0, size: 12 },
  });

  const tooMany = Array.from({ length: MAX_ACCOUNTS + 1 }, () => ({ platform: 'x', handle: 'me' }));
  expect(cleanSocialsConfig({ accounts: tooMany }).ok).toBe(false);
});

test('a stored row that no longer validates reads as the defaults', () => {
  expect(parseSocialsConfig(null)).toEqual(SOCIALS_DEFAULTS);
  expect(parseSocialsConfig({ pos: 'nowhere' })).toEqual(SOCIALS_DEFAULTS);
});

test('saving round-trips through the row, and bad input is a 400', async () => {
  const { user } = await makeUser();
  const saved = await saveSocialsConfigFor(user.id, {
    accounts: [{ platform: 'youtube', handle: '@chan' }],
    showSec: 4,
  });
  expect(saved.ok).toBe(true);
  const read = await getSocialsConfig(user.id);
  expect(read.accounts).toEqual([{ platform: 'youtube', handle: '@chan' }]);
  expect(read.showSec).toBe(4);

  expect(await saveSocialsConfigFor(user.id, { size: 'big' })).toMatchObject({ ok: false, status: 400 });
  // The refused save left the stored config alone.
  expect((await getSocialsConfig(user.id)).showSec).toBe(4);
});
