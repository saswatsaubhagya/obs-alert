import { beforeEach, expect, test, vi } from 'vitest';
import prisma from '@/lib/db';
import { sendAlert } from '@/lib/sendAlert';
import { __reset, subscribe } from '@/lib/hub';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  __reset();
  await resetDb();
});

const donation = { type: 'donation', name: 'bob', amount: 500, currency: 'USD', message: 'gg' };

test('rejects an unknown event type and lists the known ones', async () => {
  const { user } = await makeUser();
  const r = await sendAlert(user.id, { type: 'nope', name: 'x' }, 'api');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ error: 'unknown event type' });
  expect((r.body as { known: string[] }).known).toContain('donation');
});

// I5's siblings: BUILT_IN is a plain object literal, so a prototype-chain key
// like `toString` is truthy against a bare `BUILT_IN[key]` lookup and would
// throw past this guard instead of 400ing.
test('a prototype-chain key like "toString" is a 400, not a 500', async () => {
  const { user } = await makeUser();
  const r = await sendAlert(user.id, { type: 'toString' }, 'api');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ error: 'unknown event type' });
});

test('rejects a missing required field and names the type', async () => {
  const { user } = await makeUser();
  const r = await sendAlert(user.id, { type: 'donation', name: 'bob' }, 'api');
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: 'field "amount" required', type: 'donation' });
});

test('rejects a missing type', async () => {
  const { user } = await makeUser();
  expect((await sendAlert(user.id, { name: 'bob' }, 'api')).status).toBe(400);
});

test('delivers to a connected overlay and reports the count', async () => {
  const { user } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const r = await sendAlert(user.id, donation, 'api');
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ ok: true, delivered: 1 });

  const payload = JSON.parse(frames[0].slice(6));
  expect(payload.text).toBe('bob donated $500.00!');
  expect(payload.title).toBe('DONATION');
  expect(payload.message).toBe('gg');
});

test('works with no config row, using built-in defaults', async () => {
  const { user } = await makeUser();
  expect(await prisma.alertConfig.count({ where: { userId: user.id } })).toBe(0);
  expect((await sendAlert(user.id, donation, 'api')).status).toBe(200);
});

test('succeeds with delivered 0 when no overlay is connected, and still logs', async () => {
  const { user } = await makeUser();
  const r = await sendAlert(user.id, donation, 'api');
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ delivered: 0 });
  const log = await prisma.alertLog.findFirst({ where: { userId: user.id } });
  expect(log?.renderedText).toBe('bob donated $500.00!');
  expect(log?.deliveredTo).toBe(0);
  expect(log?.source).toBe('api');
});

test('a successful win send writes exactly one AlertLog row for that user', async () => {
  const { user } = await makeUser();
  const r = await sendAlert(user.id, { type: 'win', opponent: 'Team Red' }, 'api');
  expect(r.status).toBe(200);

  const logs = await prisma.alertLog.findMany({ where: { userId: user.id } });
  expect(logs).toHaveLength(1);
  expect(logs[0].eventTypeKey).toBe('win');
});

test('a disabled type returns 202 skipped and publishes nothing', async () => {
  const { user } = await makeUser();
  await prisma.alertConfig.create({
    data: { userId: user.id, eventTypeKey: 'donation', enabled: false, template: '{name}', style: {} },
  });
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const r = await sendAlert(user.id, donation, 'api');
  expect(r).toEqual({ status: 202, body: { ok: true, delivered: 0, skipped: 'disabled' } });
  expect(frames).toHaveLength(0);
});

test('a donation below minAmount returns 202 skipped', async () => {
  const { user } = await makeUser();
  await prisma.alertConfig.create({
    data: { userId: user.id, eventTypeKey: 'donation', template: '{name}', style: {}, minAmount: 1000 },
  });
  const r = await sendAlert(user.id, { ...donation, amount: 500 }, 'api');
  expect(r).toEqual({ status: 202, body: { ok: true, delivered: 0, skipped: 'below_min_amount' } });

  const at = await sendAlert(user.id, { ...donation, amount: 1000 }, 'api');
  expect(at.status).toBe(200);
});

test('minAmount does not affect types without an amount field', async () => {
  const { user } = await makeUser();
  await prisma.alertConfig.create({
    data: { userId: user.id, eventTypeKey: 'follow', template: '{name}', style: {}, minAmount: 1000 },
  });
  expect((await sendAlert(user.id, { type: 'follow', name: 'bob' }, 'api')).status).toBe(200);
});

test("one user's alert never reaches another user's overlay", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bFrames: string[] = [];
  subscribe(b.user.id, (f) => bFrames.push(f));

  await sendAlert(a.user.id, donation, 'api');
  expect(bFrames).toHaveLength(0);
});

test('a users own custom template and style are applied', async () => {
  const { user } = await makeUser();
  await prisma.alertConfig.create({
    data: {
      userId: user.id,
      eventTypeKey: 'donation',
      template: 'BIG UP {name} ({amount})',
      titleTemplate: 'TIP',
      style: { accent: '#ff0000' },
      durationMs: 9000,
    },
  });
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));
  await sendAlert(user.id, donation, 'api');

  const p = JSON.parse(frames[0].slice(6));
  expect(p.text).toBe('BIG UP bob ($500.00)');
  expect(p.title).toBe('TIP');
  expect(p.style.accent).toBe('#ff0000');
  expect(p.durationMs).toBe(9000);
});

test('records the source on the log row', async () => {
  const { user } = await makeUser();
  await sendAlert(user.id, donation, 'test');
  const log = await prisma.alertLog.findFirst({ where: { userId: user.id } });
  expect(log?.source).toBe('test');
});

test('donor markup survives as literal text in the rendered output', async () => {
  const { user } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));
  await sendAlert(user.id, { ...donation, name: '<img src=x onerror=alert(1)>' }, 'api');
  const p = JSON.parse(frames[0].slice(6));
  expect(p.text).toContain('<img src=x onerror=alert(1)>');
});

// M1: the alert is published before the log row is written, so a failing log
// write must not turn into a 500 — the caller would retry and put a duplicate
// alert on stream.
test('a failed log write still returns 200 after the alert has been delivered', async () => {
  const { user } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const create = vi.spyOn(prisma.alertLog, 'create').mockRejectedValueOnce(new Error('db blip'));
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const r = await sendAlert(user.id, donation, 'api');
    expect(r.status).toBe(200);
    expect(frames).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('alert log write failed'));
  } finally {
    create.mockRestore();
    errors.mockRestore();
  }
});
