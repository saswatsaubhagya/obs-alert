import { beforeEach, expect, test } from 'vitest';
import { handleControlScore } from '@/lib/controlScore';
import { handleControlFire } from '@/lib/controlFire';
import { getScore } from '@/lib/score';
import { SCORE_DEFAULTS } from '@/lib/scoreConfig';
import { __reset as resetHub, subscribe } from '@/lib/hub';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

const post = (payload: unknown) =>
  new Request('http://localhost/api/control/x/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const get = () => new Request('http://localhost/api/control/x/score');

beforeEach(async () => {
  resetHub();
  resetRl();
  await resetDb();
});

test('GET reads the score and POST moves it, fanning the new value out', async () => {
  const { user, overlay } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  expect(await (await handleControlScore(get(), overlay.controlToken)).json()).toEqual({
    wins: 0,
    losses: 0,
    config: SCORE_DEFAULTS,
  });

  const res = await handleControlScore(post({ type: 'win', delta: 1 }), overlay.controlToken);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ wins: 1, losses: 0 });
  expect(JSON.parse(frames[0].slice(6))).toMatchObject({ widget: 'score', wins: 1, losses: 0 });
});

test('a decrement stops at zero instead of going negative', async () => {
  const { user, overlay } = await makeUser();
  const res = await handleControlScore(post({ type: 'lose', delta: -1 }), overlay.controlToken);
  expect(await res.json()).toMatchObject({ wins: 0, losses: 0 });
  expect(await getScore(user.id)).toMatchObject({ wins: 0, losses: 0 });
});

test('reset clears both counters', async () => {
  const { user, overlay } = await makeUser();
  await handleControlScore(post({ type: 'win', delta: 1 }), overlay.controlToken);
  await handleControlScore(post({ type: 'lose', delta: 1 }), overlay.controlToken);
  await handleControlScore(post({ type: 'reset' }), overlay.controlToken);
  expect(await getScore(user.id)).toMatchObject({ wins: 0, losses: 0 });
});

test('bad input is a 400 and changes nothing', async () => {
  const { user, overlay } = await makeUser();
  for (const body of [
    { type: 'nope', delta: 1 },
    { type: 'toString', delta: 1 },
    { type: 'win', delta: 99 },
    { type: 'win' },
    { type: 'win', delta: '1' },
    'not json',
    [1, 2],
  ]) {
    const res = await handleControlScore(post(body), overlay.controlToken);
    expect(res.status).toBe(400);
  }
  expect(await getScore(user.id)).toMatchObject({ wins: 0, losses: 0 });
});

test('an unknown token and an empty token give an identical 401', async () => {
  await makeUser();
  for (const token of ['', 'not-a-real-token']) {
    const res = await handleControlScore(post({ type: 'win', delta: 1 }), token);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid control token' });
  }
});

test('a body over the cap is a 413', async () => {
  const { overlay } = await makeUser();
  const res = await handleControlScore(
    post(JSON.stringify({ type: 'win', delta: 1, pad: 'x'.repeat(70 * 1024) })),
    overlay.controlToken
  );
  expect(res.status).toBe(413);
});

test('firing a result from the dock counts it', async () => {
  const { user, overlay } = await makeUser();
  const fire = (type: string) =>
    handleControlFire(
      new Request('http://localhost/api/control/x/fire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type }),
      }),
      overlay.controlToken
    );

  const res = await fire('win');
  expect(await res.json()).toMatchObject({ score: { wins: 1, losses: 0 } });
  await fire('lose');
  expect(await getScore(user.id)).toMatchObject({ wins: 1, losses: 1 });
});
