import { beforeEach, expect, test } from 'vitest';
import { GET } from '@/app/api/overlay/[token]/events/route';
import { countFor, publish, __reset } from '@/lib/hub';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  __reset();
  await resetDb();
});

const params = (token: string) => ({ params: Promise.resolve({ token }) });

test('an unknown token gives 404 and registers no subscriber', async () => {
  const { user } = await makeUser();
  const res = await GET(new Request('http://localhost'), params('nope'));
  expect(res.status).toBe(404);
  // Proves subscribe() never ran for the 404 path: a reorder that hoisted
  // subscribe() above the early return would still 404 here but would leave
  // a dangling subscription behind.
  expect(countFor(user.id)).toBe(0);
});

test('a valid token opens an event-stream and subscribes the user', async () => {
  const { user, overlay } = await makeUser();
  const res = await GET(new Request('http://localhost'), params(overlay.token));

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(res.headers.get('x-accel-buffering')).toBe('no');

  const reader = res.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  expect(first).toContain(': connected');
  expect(countFor(user.id)).toBe(1);

  publish(user.id, { text: 'bob followed' });
  const frame = new TextDecoder().decode((await reader.read()).value);
  expect(JSON.parse(frame.slice(6)).text).toBe('bob followed');

  await reader.cancel();
});

test('cancelling the stream unsubscribes', async () => {
  const { user, overlay } = await makeUser();
  const res = await GET(new Request('http://localhost'), params(overlay.token));
  const reader = res.body!.getReader();
  await reader.read();
  expect(countFor(user.id)).toBe(1);

  await reader.cancel();
  await new Promise((r) => setTimeout(r, 20));
  expect(countFor(user.id)).toBe(0);
});

test('a token only subscribes to its own owner', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const res = await GET(new Request('http://localhost'), params(a.overlay.token));
  const reader = res.body!.getReader();
  await reader.read();

  expect(countFor(a.user.id)).toBe(1);
  expect(countFor(b.user.id)).toBe(0);
  await reader.cancel();
});
