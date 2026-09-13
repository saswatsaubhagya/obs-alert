import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { handleControlFire } from '@/lib/controlFire';
import { __reset as resetHub, subscribe } from '@/lib/hub';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

const post = (payload: unknown) =>
  new Request('http://localhost/api/control/x/fire', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

beforeEach(async () => {
  resetHub();
  resetRl();
  await resetDb();
});

test('a valid control token fires a win and logs it as a control send', async () => {
  const { user, overlay } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const res = await handleControlFire(post({ type: 'win', opponent: 'Team Red' }), overlay.controlToken);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, delivered: 1 });

  const frame = JSON.parse(frames[0].slice(6));
  expect(frame.widget).toBe('result');
  expect(frame.text).toBe('VICTORY');

  const logs = await prisma.alertLog.findMany({ where: { userId: user.id } });
  expect(logs).toHaveLength(1);
  expect(logs[0].source).toBe('control');
  expect(logs[0].eventTypeKey).toBe('win');
});

test('lose fires too', async () => {
  const { overlay } = await makeUser();
  const res = await handleControlFire(post({ type: 'lose' }), overlay.controlToken);
  expect(res.status).toBe(200);
});

test('an unknown token and an empty token give an identical 401', async () => {
  await makeUser();
  for (const token of ['', 'not-a-real-token']) {
    const res = await handleControlFire(post({ type: 'win' }), token);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid control token' });
  }
});

test('a non-result event type is refused and writes no log row', async () => {
  const { user, overlay } = await makeUser();
  const res = await handleControlFire(
    post({ type: 'donation', name: 'bob', amount: 500 }),
    overlay.controlToken
  );
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: 'this endpoint only fires result widgets',
    known: ['win', 'lose'],
  });
  expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(0);
});

test('a prototype-chain type is a 400, not a 500', async () => {
  const { user, overlay } = await makeUser();
  const res = await handleControlFire(post({ type: 'toString' }), overlay.controlToken);
  expect(res.status).toBe(400);
  expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(0);
});

test('a body over 64KB is a 413, not forwarded to sendAlert', async () => {
  const { overlay } = await makeUser();
  const big = 'x'.repeat(64 * 1024 + 1);
  const res = await handleControlFire(post({ type: 'win', opponent: big }), overlay.controlToken);
  expect(res.status).toBe(413);
  expect(await res.json()).toEqual({ error: 'body too large' });
});

test('message in the request body never reaches the rendered frame or the AlertLog payload', async () => {
  const { user, overlay } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  const res = await handleControlFire(
    post({ type: 'win', opponent: 'Team Red', message: 'ARBITRARY TEXT ON STREAM' }),
    overlay.controlToken
  );
  expect(res.status).toBe(200);

  const frame = JSON.parse(frames[0].slice(6));
  expect(frame.message).toBe('');
  expect(JSON.stringify(frame)).not.toContain('ARBITRARY TEXT ON STREAM');

  const logs = await prisma.alertLog.findMany({ where: { userId: user.id } });
  expect(logs).toHaveLength(1);
  expect(JSON.stringify(logs[0].payload)).not.toContain('ARBITRARY TEXT ON STREAM');
});

test('an over-long opponent is truncated to 120 characters rather than rejected', async () => {
  const { overlay } = await makeUser();
  const long = 'a'.repeat(200);
  const res = await handleControlFire(post({ type: 'win', opponent: long }), overlay.controlToken);
  expect(res.status).toBe(200);

  const logs = await prisma.alertLog.findMany();
  const payload = logs[logs.length - 1].payload as { opponent?: string };
  expect(payload.opponent).toHaveLength(120);
  expect(payload.opponent).toBe('a'.repeat(120));
});

test('a normal opponent still arrives intact', async () => {
  const { overlay } = await makeUser();
  const res = await handleControlFire(post({ type: 'win', opponent: 'Team Red' }), overlay.controlToken);
  expect(res.status).toBe(200);

  const logs = await prisma.alertLog.findMany();
  const payload = logs[logs.length - 1].payload as { opponent?: string };
  expect(payload.opponent).toBe('Team Red');
});

test('a body that is not a JSON object is a 400', async () => {
  const { overlay } = await makeUser();
  expect((await handleControlFire(post('not json'), overlay.controlToken)).status).toBe(400);
  expect((await handleControlFire(post([1, 2]), overlay.controlToken)).status).toBe(400);
});

test('the rate limiter trips and sets retry-after', async () => {
  const { overlay } = await makeUser();
  let last: Response | undefined;
  for (let i = 0; i < 61; i++) {
    last = await handleControlFire(post({ type: 'win' }), overlay.controlToken);
  }
  expect(last!.status).toBe(429);
  expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
});

test('a disabled type reports skipped rather than failing', async () => {
  const { user, overlay } = await makeUser();
  await prisma.alertConfig.create({
    data: {
      userId: user.id,
      eventTypeKey: 'win',
      enabled: false,
      template: 'VICTORY',
      style: {},
      durationMs: 4000,
    },
  });
  const res = await handleControlFire(post({ type: 'win' }), overlay.controlToken);
  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({ skipped: 'disabled' });
});
