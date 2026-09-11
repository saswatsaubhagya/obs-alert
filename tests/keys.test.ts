import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { generateKey, hashKey, resolveKey } from '@/lib/keys';
import { makeUser, resetDb } from './helpers/db';

beforeEach(resetDb);

test('generated keys are prefixed, long, and unique', () => {
  const a = generateKey();
  const b = generateKey();
  expect(a.plain).toMatch(/^oba_[A-Za-z0-9_-]{40,}$/);
  expect(a.plain).not.toBe(b.plain);
  expect(a.hash).toBe(hashKey(a.plain));
  expect(a.plain.startsWith(a.prefix)).toBe(true);
  expect(a.prefix.length).toBeLessThan(a.plain.length);
});

test('the plaintext key is never derivable from what is stored', () => {
  const { plain, hash, prefix } = generateKey();
  expect(hash).not.toContain(plain.slice(10));
  expect(prefix).not.toBe(plain);
});

test('resolveKey returns the owning user and stamps lastUsedAt', async () => {
  const { user } = await makeUser();
  const k = generateKey();
  const row = await prisma.ingestKey.create({
    data: { userId: user.id, name: 'n8n', hash: k.hash, prefix: k.prefix },
  });
  expect(row.lastUsedAt).toBeNull();

  const got = await resolveKey(k.plain);
  expect(got).toMatchObject({ userId: user.id, keyId: row.id });
  const after = await prisma.ingestKey.findUnique({ where: { id: row.id } });
  expect(after?.lastUsedAt).not.toBeNull();
});

test('unknown, empty, and revoked keys all resolve to null', async () => {
  const { user } = await makeUser();
  const k = generateKey();
  await prisma.ingestKey.create({
    data: { userId: user.id, name: 'old', hash: k.hash, prefix: k.prefix, revokedAt: new Date() },
  });
  expect(await resolveKey(k.plain)).toBeNull();
  expect(await resolveKey('oba_nonsense')).toBeNull();
  expect(await resolveKey('')).toBeNull();
});

test('a key resolves only to its own owner', async () => {
  const a = await makeUser();
  await makeUser();
  const k = generateKey();
  await prisma.ingestKey.create({ data: { userId: a.user.id, name: 'k', hash: k.hash, prefix: k.prefix } });
  expect((await resolveKey(k.plain))?.userId).toBe(a.user.id);
});
