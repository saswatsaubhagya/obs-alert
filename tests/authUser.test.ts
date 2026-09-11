import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { createUser, verifyCredentials } from '@/lib/auth-user';
import { resetDb } from './helpers/db';

beforeEach(resetDb);

test('creates a user, hashes the password, and provisions an overlay', async () => {
  const r = await createUser('a@test.dev', 'correct horse battery');
  expect('id' in r).toBe(true);

  const row = await prisma.user.findUnique({ where: { email: 'a@test.dev' } });
  expect(row!.passwordHash).not.toContain('correct horse');
  expect(row!.passwordHash.startsWith('$argon2')).toBe(true);

  const overlay = await prisma.overlay.findFirst({ where: { userId: row!.id } });
  expect(overlay!.token).toHaveLength(43); // 32 bytes base64url
});

test('normalizes the email and refuses duplicates', async () => {
  await createUser('a@test.dev', 'correct horse battery');
  const dup = await createUser('  A@Test.dev ', 'another password');
  expect(dup).toEqual({ error: 'email already registered' });
  expect(await prisma.user.count()).toBe(1);
});

test('refuses a short password and a malformed email', async () => {
  expect(await createUser('a@test.dev', 'short')).toEqual({
    error: 'password must be at least 8 characters',
  });
  expect(await createUser('nope', 'correct horse battery')).toEqual({ error: 'invalid email' });
  expect(await prisma.user.count()).toBe(0);
});

test('verifies correct credentials, case-insensitively on email', async () => {
  await createUser('a@test.dev', 'correct horse battery');
  expect(await verifyCredentials('A@TEST.DEV', 'correct horse battery')).toMatchObject({
    email: 'a@test.dev',
  });
});

test('rejects a wrong password and an unknown email', async () => {
  await createUser('a@test.dev', 'correct horse battery');
  expect(await verifyCredentials('a@test.dev', 'wrong')).toBeNull();
  expect(await verifyCredentials('nobody@test.dev', 'correct horse battery')).toBeNull();
  expect(await verifyCredentials('', '')).toBeNull();
});
