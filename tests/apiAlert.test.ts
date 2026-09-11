import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { handleAlertRequest } from '@/lib/apiAlert';
import { generateKey } from '@/lib/keys';
import { __reset as resetHub, subscribe } from '@/lib/hub';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

const body = { type: 'donation', name: 'bob', amount: 500, currency: 'USD' };

async function seedKey() {
  const { user } = await makeUser();
  const k = generateKey();
  await prisma.ingestKey.create({ data: { userId: user.id, name: 'n8n', hash: k.hash, prefix: k.prefix } });
  return { user, plain: k.plain };
}

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/v1/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

beforeEach(async () => {
  resetHub();
  resetRl();
  await resetDb();
});

test('a valid key in the path delivers the alert', async () => {
  const { user, plain } = await seedKey();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const res = await handleAlertRequest(post(body), plain);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, delivered: 1 });
  expect(JSON.parse(frames[0].slice(6)).text).toBe('bob donated $500.00!');
});

test('the same key works as a bearer header', async () => {
  const { plain } = await seedKey();
  const res = await handleAlertRequest(post(body, { authorization: `Bearer ${plain}` }));
  expect(res.status).toBe(200);
});

test('missing, unknown, and revoked keys all give an identical 401', async () => {
  const { plain } = await seedKey();
  await prisma.ingestKey.updateMany({ data: { revokedAt: new Date() } });

  for (const res of [
    await handleAlertRequest(post(body)),
    await handleAlertRequest(post(body), 'oba_wrong'),
    await handleAlertRequest(post(body), plain),
  ]) {
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid ingest key' });
  }
});

test('another users key cannot reach this users overlay', async () => {
  const a = await seedKey();
  const b = await makeUser();
  const bFrames: string[] = [];
  subscribe(b.user.id, (f) => bFrames.push(f));

  await handleAlertRequest(post(body), a.plain);
  expect(bFrames).toHaveLength(0);
});

test('invalid JSON gives 400', async () => {
  const { plain } = await seedKey();
  const res = await handleAlertRequest(post('{"type":'), plain);
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'invalid JSON' });
});

test('unknown type gives 400 with the known list', async () => {
  const { plain } = await seedKey();
  const res = await handleAlertRequest(post({ type: 'nope' }), plain);
  expect(res.status).toBe(400);
  expect((await res.json()).known).toContain('follow');
});

test('a body over 64KB gives 413 and never reaches sendAlert', async () => {
  const { plain } = await seedKey();
  const huge = { type: 'donation', name: 'bob', amount: 1, message: 'x'.repeat(70_000) };
  const res = await handleAlertRequest(post(huge), plain);
  expect(res.status).toBe(413);
  expect(await prisma.alertLog.count()).toBe(0);
});

test('the 61st alert in a minute gives 429 with Retry-After', async () => {
  const { plain } = await seedKey();
  for (let i = 0; i < 60; i++) {
    expect((await handleAlertRequest(post(body), plain)).status).toBe(200);
  }
  const res = await handleAlertRequest(post(body), plain);
  expect(res.status).toBe(429);
  expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
});

test('a disabled type gives 202 skipped', async () => {
  const { user, plain } = await seedKey();
  await prisma.alertConfig.create({
    data: { userId: user.id, eventTypeKey: 'donation', enabled: false, template: '{name}', style: {} },
  });
  const res = await handleAlertRequest(post(body), plain);
  expect(res.status).toBe(202);
  expect((await res.json()).skipped).toBe('disabled');
});

test('the log records source api', async () => {
  const { plain } = await seedKey();
  await handleAlertRequest(post(body), plain);
  expect((await prisma.alertLog.findFirst())?.source).toBe('api');
});
