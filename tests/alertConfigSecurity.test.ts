// The patch and the event-type key handed to saveConfigFor arrive through
// saveConfigAction — a 'use server' export — so they are wire input, whatever
// their TypeScript types say. These are the regression tests for that.
import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { sampleValues, saveConfigFor, sendFromDashboard, type ConfigPatch } from '@/lib/alertConfig';
import { effectiveConfig } from '@/lib/sendAlert';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});

test('a userId smuggled into the patch cannot write to another users row', async () => {
  const attacker = await makeUser();
  const victim = await makeUser();

  // The exact probe from the review.
  const r = await saveConfigFor(attacker.user.id, 'donation', {
    template: 'OWNED',
    userId: victim.user.id,
  } as ConfigPatch);
  expect(r.ok).toBe(true);

  expect(await prisma.alertConfig.count({ where: { userId: victim.user.id } })).toBe(0);
  const attackerRows = await prisma.alertConfig.findMany({ where: { userId: attacker.user.id } });
  expect(attackerRows).toHaveLength(1);
  expect(attackerRows[0].template).toBe('OWNED');
  expect((await effectiveConfig(victim.user.id, 'donation')).render.template).toBe('{name} donated {amount}!');
});

test('a smuggled userId cannot hijack an existing row on update either', async () => {
  const attacker = await makeUser();
  const victim = await makeUser();
  await saveConfigFor(attacker.user.id, 'donation', { template: 'mine' });
  await saveConfigFor(victim.user.id, 'donation', { template: 'theirs' });

  await saveConfigFor(attacker.user.id, 'donation', {
    template: 'OWNED',
    userId: victim.user.id,
  } as ConfigPatch);

  expect((await effectiveConfig(victim.user.id, 'donation')).render.template).toBe('theirs');
  expect((await effectiveConfig(attacker.user.id, 'donation')).render.template).toBe('OWNED');
});

test('a non-numeric durationMs is rejected with a 400 and never reaches Prisma', async () => {
  const { user } = await makeUser();
  const r = await saveConfigFor(user.id, 'donation', { durationMs: 'abc' } as unknown as ConfigPatch);
  expect(r).toEqual({ ok: false, status: 400, error: 'durationMs must be a number' });
  expect(await prisma.alertConfig.count({ where: { userId: user.id } })).toBe(0);

  for (const bad of [{ soundVolume: null }, { minAmount: 'lots' }, { enabled: 'yes' }, { template: 42 }]) {
    const res = await saveConfigFor(user.id, 'donation', bad as unknown as ConfigPatch);
    expect(res.ok, JSON.stringify(bad)).toBe(false);
  }
  expect(await prisma.alertConfig.count({ where: { userId: user.id } })).toBe(0);
});

test('unknown style keys are dropped and CSS-injecting style values rejected', async () => {
  const { user } = await makeUser();
  await saveConfigFor(user.id, 'donation', {
    style: { accent: '#123456', userId: 'nope', evil: 'x' },
  } as unknown as ConfigPatch);

  const saved = (await prisma.alertConfig.findFirstOrThrow({ where: { userId: user.id } })).style as Record<
    string,
    unknown
  >;
  expect(saved.accent).toBe('#123456');
  expect(saved.userId).toBeUndefined();
  expect(saved.evil).toBeUndefined();

  // style.accent is injected verbatim into the overlay card's cssText.
  const injected = await saveConfigFor(user.id, 'donation', {
    style: { accent: 'red;background:url(https://evil/x)' },
  } as unknown as ConfigPatch);
  expect(injected.ok).toBe(false);
  expect(
    ((await prisma.alertConfig.findFirstOrThrow({ where: { userId: user.id } })).style as Record<string, unknown>)
      .accent
  ).toBe('#123456');
});

test('legitimate style values still save', async () => {
  const { user } = await makeUser();
  const r = await saveConfigFor(user.id, 'follow', {
    style: { bg: 'rgba(12,12,16,0.86)', font: 'system-ui, sans-serif', size: 40, anim: 'pop', pos: 'bottom-right' },
  } as ConfigPatch);
  expect(r.ok).toBe(true);
  const c = await effectiveConfig(user.id, 'follow');
  expect(c.render.style.bg).toBe('rgba(12,12,16,0.86)');
  expect(c.render.style.anim).toBe('pop');
});

// --- I5: an arbitrary event-type key is client input too ---

test('an unknown event type is a 400, not a throw', async () => {
  const { user } = await makeUser();
  expect(await saveConfigFor(user.id, 'nope', { template: 'x' })).toEqual({
    ok: false,
    status: 400,
    error: 'unknown event type',
  });
  // sampleValues underpins testFireAction, whose argument is client input.
  expect(sampleValues('nope')).toEqual({});
  const fire = await sendFromDashboard(user.id, { type: 'nope', ...sampleValues('nope') }, 'test');
  expect(fire.status).toBe(400);
});
