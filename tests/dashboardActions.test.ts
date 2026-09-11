import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { sampleValues, saveConfigFor, sendFromDashboard } from '@/lib/alertConfig';
import { effectiveConfig } from '@/lib/sendAlert';
import { __reset, subscribe } from '@/lib/hub';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  __reset();
  await resetDb();
});

test('saving creates the config row on first save and updates it after', async () => {
  const { user } = await makeUser();
  await saveConfigFor(user.id, 'donation', { template: 'v1 {name}' });
  expect(await prisma.alertConfig.count({ where: { userId: user.id } })).toBe(1);

  await saveConfigFor(user.id, 'donation', { template: 'v2 {name}' });
  expect(await prisma.alertConfig.count({ where: { userId: user.id } })).toBe(1);
  expect((await effectiveConfig(user.id, 'donation')).render.template).toBe('v2 {name}');
});

test('a partial save leaves other fields alone', async () => {
  const { user } = await makeUser();
  await saveConfigFor(user.id, 'donation', { template: 'custom {name}', durationMs: 8000 });
  await saveConfigFor(user.id, 'donation', { enabled: false });

  const c = await effectiveConfig(user.id, 'donation');
  expect(c.render.template).toBe('custom {name}');
  expect(c.render.durationMs).toBe(8000);
  expect(c.enabled).toBe(false);
});

test('an unsaved type reports built-in defaults', async () => {
  const { user } = await makeUser();
  const c = await effectiveConfig(user.id, 'follow');
  expect(c.render.template).toBe('{name} just followed!');
  expect(c.enabled).toBe(true);
});

test('saved config is scoped to its own user', async () => {
  const a = await makeUser();
  const b = await makeUser();
  await saveConfigFor(a.user.id, 'donation', { template: 'A only {name}' });
  expect((await effectiveConfig(b.user.id, 'donation')).render.template).toBe('{name} donated {amount}!');
});

test('sample values satisfy every required field of every type', async () => {
  const { user } = await makeUser();
  for (const type of ['donation', 'follow', 'sub', 'raid']) {
    const r = await sendFromDashboard(user.id, { type, ...sampleValues(type) }, 'test');
    expect(r.status, type).toBe(200);
  }
});

test('test fire travels the real pipeline and logs source test', async () => {
  const { user } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  await sendFromDashboard(user.id, { type: 'donation', ...sampleValues('donation') }, 'test');
  expect(frames).toHaveLength(1);
  expect((await prisma.alertLog.findFirst())?.source).toBe('test');
});

test('a manual send logs source dashboard and is validated the same way', async () => {
  const { user } = await makeUser();
  const ok = await sendFromDashboard(user.id, { type: 'follow', name: 'bob' }, 'dashboard');
  expect(ok.status).toBe(200);
  expect((await prisma.alertLog.findFirst())?.source).toBe('dashboard');

  const bad = await sendFromDashboard(user.id, { type: 'donation', name: 'bob' }, 'dashboard');
  expect(bad.status).toBe(400);
});

test('test fire still fires while the type is disabled for live traffic', async () => {
  const { user } = await makeUser();
  await saveConfigFor(user.id, 'donation', { enabled: false });
  const r = await sendFromDashboard(user.id, { type: 'donation', ...sampleValues('donation') }, 'test');
  expect(r.status).toBe(202);
  expect((r.body as { skipped: string }).skipped).toBe('disabled');
});
