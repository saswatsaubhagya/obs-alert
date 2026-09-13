import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import {
  createIngestKeyFor,
  revokeIngestKeyFor,
  rotateOverlayTokenFor,
  rotateControlTokenFor,
} from '@/lib/settings';
import { hashKey, resolveKey } from '@/lib/keys';
import { handleControlFire } from '@/lib/controlFire';
import { __reset as resetRl } from '@/lib/ratelimit';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  resetRl();
  await resetDb();
});

test('creates a usable key and stores only its hash and prefix', async () => {
  const { user } = await makeUser();
  const { plain } = await createIngestKeyFor(user.id, 'n8n prod');

  const row = await prisma.ingestKey.findFirst({ where: { userId: user.id } });
  expect(row!.name).toBe('n8n prod');
  expect(row!.hash).toBe(hashKey(plain));
  expect(JSON.stringify(row)).not.toContain(plain.slice(10));
  expect((await resolveKey(plain))?.userId).toBe(user.id);
});

test('names an unnamed key rather than storing blank', async () => {
  const { user } = await makeUser();
  await createIngestKeyFor(user.id, '   ');
  expect((await prisma.ingestKey.findFirst())!.name).toBe('Untitled key');
});

test('revoking a key makes it stop working, keeping the row for audit', async () => {
  const { user } = await makeUser();
  const { plain } = await createIngestKeyFor(user.id, 'k');
  const row = await prisma.ingestKey.findFirst({ where: { userId: user.id } });

  expect(await revokeIngestKeyFor(user.id, row!.id)).toEqual({ ok: true });
  expect(await resolveKey(plain)).toBeNull();
  expect(await prisma.ingestKey.count()).toBe(1);
});

test('a user cannot revoke another users key', async () => {
  const a = await makeUser();
  const b = await makeUser();
  await createIngestKeyFor(a.user.id, 'k');
  const row = await prisma.ingestKey.findFirst({ where: { userId: a.user.id } });

  expect(await revokeIngestKeyFor(b.user.id, row!.id)).toEqual({ ok: false });
  expect((await prisma.ingestKey.findUnique({ where: { id: row!.id } }))!.revokedAt).toBeNull();
});

test('multiple keys coexist and revoking one leaves the other working', async () => {
  const { user } = await makeUser();
  const k1 = await createIngestKeyFor(user.id, 'one');
  const k2 = await createIngestKeyFor(user.id, 'two');
  const row1 = await prisma.ingestKey.findFirst({ where: { name: 'one' } });

  await revokeIngestKeyFor(user.id, row1!.id);
  expect(await resolveKey(k1.plain)).toBeNull();
  expect(await resolveKey(k2.plain)).not.toBeNull();
});

test('rotating the overlay token invalidates the old one', async () => {
  const { user, overlay } = await makeUser();
  const { token } = await rotateOverlayTokenFor(user.id);

  expect(token).not.toBe(overlay.token);
  expect(await prisma.overlay.findUnique({ where: { token: overlay.token } })).toBeNull();
  expect((await prisma.overlay.findUnique({ where: { token } }))!.userId).toBe(user.id);
});

test('rotating the control token replaces it', async () => {
  const { user, overlay } = await makeUser();
  const { controlToken } = await rotateControlTokenFor(user.id);
  expect(controlToken).not.toBe(overlay.controlToken);

  const row = await prisma.overlay.findFirst({ where: { userId: user.id } });
  expect(row?.controlToken).toBe(controlToken);
});

test('rotating the control token leaves the overlay token alone', async () => {
  const { user, overlay } = await makeUser();
  await rotateControlTokenFor(user.id);
  const row = await prisma.overlay.findFirst({ where: { userId: user.id } });
  expect(row?.token).toBe(overlay.token);
});

test('the old control token stops firing once rotated', async () => {
  const { user, overlay } = await makeUser();
  await rotateControlTokenFor(user.id);

  const res = await handleControlFire(
    new Request('http://localhost/api/control/x/fire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'win' }),
    }),
    overlay.controlToken
  );
  expect(res.status).toBe(401);
  expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(0);
});
