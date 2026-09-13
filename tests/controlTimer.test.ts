import { beforeEach, expect, test, vi } from 'vitest';
import { handleControlTimer } from '@/lib/controlTimer';
import { getTimer, MAX_ADJUST_MS, MAX_DURATION_MS } from '@/lib/timer';
import { TIMER_DEFAULTS } from '@/lib/timerConfig';
import { __reset as resetHub, subscribe } from '@/lib/hub';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

const post = (payload: unknown) =>
  new Request('http://localhost/api/control/x/timer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const get = () => new Request('http://localhost/api/control/x/timer');

beforeEach(async () => {
  resetHub();
  resetRl();
  await resetDb();
});

test('GET reads a stopped clock and start runs it, fanning the new state out', async () => {
  const { user, overlay } = await makeUser();
  const frames: string[] = [];
  subscribe(user.id, (f) => frames.push(f));

  expect(await (await handleControlTimer(get(), overlay.controlToken)).json()).toEqual({
    running: false,
    remainingMs: 0,
    config: TIMER_DEFAULTS,
  });

  const res = await handleControlTimer(post({ type: 'start', ms: 300_000 }), overlay.controlToken);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ running: true, remainingMs: 300_000 });
  expect(JSON.parse(frames[0].slice(6))).toMatchObject({ widget: 'timer', running: true });

  // Read back through the clock: the remaining time shrinks on its own.
  const later = await getTimer(user.id, Date.now() + 60_000);
  expect(later.running).toBe(true);
  expect(later.remainingMs).toBeLessThanOrEqual(240_000);
  expect(later.remainingMs).toBeGreaterThan(239_000);
});

test('pause parks what is left and resume puts it back on the clock', async () => {
  const { user, overlay } = await makeUser();
  vi.useFakeTimers();
  try {
    await handleControlTimer(post({ type: 'start', ms: 300_000 }), overlay.controlToken);
    vi.advanceTimersByTime(120_000);
    const paused = await (await handleControlTimer(post({ type: 'pause' }), overlay.controlToken)).json();
    expect(paused).toMatchObject({ running: false, remainingMs: 180_000 });

    // A paused clock does not move, however long it sits there.
    vi.advanceTimersByTime(600_000);
    expect(await getTimer(user.id)).toMatchObject({ running: false, remainingMs: 180_000 });

    const resumed = await (await handleControlTimer(post({ type: 'resume' }), overlay.controlToken)).json();
    expect(resumed).toMatchObject({ running: true, remainingMs: 180_000 });
  } finally {
    vi.useRealTimers();
  }
});

test('add nudges either state, never below zero or past the cap', async () => {
  const { user, overlay } = await makeUser();
  vi.useFakeTimers();
  try {
    await handleControlTimer(post({ type: 'start', ms: 300_000 }), overlay.controlToken);
    const up = await (await handleControlTimer(post({ type: 'add', ms: 60_000 }), overlay.controlToken)).json();
    expect(up).toMatchObject({ running: true, remainingMs: 360_000 });

    // Subtracting more than is left stops at zero rather than going negative.
    const down = await (await handleControlTimer(post({ type: 'add', ms: -MAX_ADJUST_MS }), overlay.controlToken)).json();
    expect(down).toMatchObject({ running: false, remainingMs: 0 });

    // Adding to a cleared clock parks the time without starting it; Resume
    // (or another Start) is the thing that sets it running again.
    const again = await (await handleControlTimer(post({ type: 'add', ms: 60_000 }), overlay.controlToken)).json();
    expect(again).toMatchObject({ running: false, remainingMs: 60_000 });
    expect(await getTimer(user.id)).toMatchObject({ remainingMs: 60_000 });

    // But a clock that ran out on its own is still 'running': +1m there puts
    // it straight back on the air.
    await handleControlTimer(post({ type: 'start', ms: 1000 }), overlay.controlToken);
    vi.advanceTimersByTime(5000);
    const revived = await (await handleControlTimer(post({ type: 'add', ms: 60_000 }), overlay.controlToken)).json();
    expect(revived).toMatchObject({ running: true, remainingMs: 60_000 });
  } finally {
    vi.useRealTimers();
  }
});

test('a finished countdown reads as zero rather than a negative clock', async () => {
  const { user, overlay } = await makeUser();
  await handleControlTimer(post({ type: 'start', ms: 1000 }), overlay.controlToken);
  expect(await getTimer(user.id, Date.now() + 60_000)).toMatchObject({ running: true, remainingMs: 0 });
});

test('reset clears the clock', async () => {
  const { user, overlay } = await makeUser();
  await handleControlTimer(post({ type: 'start', ms: 300_000 }), overlay.controlToken);
  await handleControlTimer(post({ type: 'reset' }), overlay.controlToken);
  expect(await getTimer(user.id)).toMatchObject({ running: false, remainingMs: 0 });
});

test('bad input is a 400 and changes nothing', async () => {
  const { user, overlay } = await makeUser();
  for (const body of [
    { type: 'nope', ms: 1000 },
    { type: 'toString', ms: 1000 },
    { type: 'start' },
    { type: 'start', ms: '60000' },
    { type: 'start', ms: 1.5 },
    { type: 'start', ms: -1 },
    { type: 'start', ms: MAX_DURATION_MS + 1 },
    { type: 'add', ms: MAX_ADJUST_MS + 1 },
    { type: 'add', ms: -MAX_ADJUST_MS - 1 },
    'not json',
    [1, 2],
  ]) {
    const res = await handleControlTimer(post(body), overlay.controlToken);
    expect(res.status, JSON.stringify(body)).toBe(400);
  }
  expect(await getTimer(user.id)).toMatchObject({ running: false, remainingMs: 0 });
});

test('an unknown control token is a 401 and an oversized body is a 413', async () => {
  const { overlay } = await makeUser();
  expect((await handleControlTimer(post({ type: 'reset' }), 'nope')).status).toBe(401);
  const big = new Request('http://localhost/api/control/x/timer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'start', ms: 1000, pad: 'x'.repeat(70_000) }),
  });
  expect((await handleControlTimer(big, overlay.controlToken)).status).toBe(413);
});
