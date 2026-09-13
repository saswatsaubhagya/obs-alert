// The one test that wires the two real routes together: an alert POSTed to the
// public ingest route must come out of the overlay's SSE route, rendered,
// exactly as it does in production. Every other test exercises one half.
import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { POST as ingest } from '@/app/api/v1/alerts/[key]/route';
import { GET as events } from '@/app/api/overlay/[token]/events/route';
import { generateKey } from '@/lib/keys';
import { __reset as resetHub } from '@/lib/hub';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  resetHub();
  resetRl();
  await resetDb();
});

async function seed() {
  const { user, overlay } = await makeUser();
  const k = generateKey();
  await prisma.ingestKey.create({ data: { userId: user.id, name: 'n8n', hash: k.hash, prefix: k.prefix } });
  return { user, overlay, plain: k.plain };
}

const post = (key: string, body: unknown) =>
  ingest(
    new Request(`http://localhost/api/v1/alerts/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) }
  );

const openOverlay = (token: string) =>
  events(new Request(`http://localhost/api/overlay/${token}/events`), { params: Promise.resolve({ token }) });

test('an alert POSTed to the ingest route arrives rendered on the overlay stream', async () => {
  const { overlay, plain } = await seed();

  const sse = await openOverlay(overlay.token);
  expect(sse.status).toBe(200);
  const reader = sse.body!.getReader();
  const decode = async () => new TextDecoder().decode((await reader.read()).value);
  expect(await decode()).toContain(': connected');

  const res = await post(plain, { type: 'donation', name: 'bob', amount: 500, currency: 'USD', message: 'gg' });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, delivered: 1 });

  const frame = await decode();
  expect(frame.startsWith('data: ')).toBe(true);
  const payload = JSON.parse(frame.slice(6));
  expect(payload.eventType).toBe('donation');
  expect(payload.title).toBe('DONATION');
  expect(payload.text).toBe('bob donated $500.00!'); // server-rendered, currency formatted
  expect(payload.message).toBe('gg'); // travels separately, never interpolated
  expect(payload.durationMs).toBe(6000);
  expect(payload.style.accent).toBe('#31d0aa');

  await reader.cancel();
});

test('an alert only reaches the overlay of the key owner', async () => {
  const a = await seed();
  const b = await seed();

  const sse = await openOverlay(b.overlay.token);
  const reader = sse.body!.getReader();
  await reader.read(); // ': connected'

  const res = await post(a.plain, { type: 'follow', name: 'bob' });
  expect(await res.json()).toMatchObject({ delivered: 0 }); // b's overlay is the only subscriber
  await reader.cancel();
});

// M9: the two secrets are different things and are not interchangeable.
test('an overlay token is not an ingest key and an ingest key is not an overlay token', async () => {
  const { overlay, plain } = await seed();

  const asKey = await post(overlay.token, { type: 'follow', name: 'bob' });
  expect(asKey.status).toBe(401);
  expect(await asKey.json()).toEqual({ error: 'invalid ingest key' });

  const asToken = await openOverlay(plain);
  expect(asToken.status).toBe(404);
  expect(await asToken.json()).toEqual({ error: 'unknown overlay' });
});

test('a win posted to the ingest API arrives as a result frame', async () => {
  const { overlay, plain } = await seed();

  const sse = await openOverlay(overlay.token);
  const reader = sse.body!.getReader();
  const decode = async () => new TextDecoder().decode((await reader.read()).value);
  expect(await decode()).toContain(': connected');

  const res = await post(plain, { type: 'win', opponent: 'Team Red' });
  expect(res.status).toBe(200);

  const frame = await decode();
  expect(frame.startsWith('data: ')).toBe(true);
  const payload = JSON.parse(frame.slice(6));
  expect(payload.widget).toBe('result');
  expect(payload.text).toBe('VICTORY');
  expect(payload.style.preset).toBe('confetti');

  await reader.cancel();
});
