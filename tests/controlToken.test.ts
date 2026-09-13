import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { newControlToken } from '@/lib/auth-user';
import { createUser } from '@/lib/auth-user';
import { makeUser, resetDb } from './helpers/db';

beforeEach(async () => {
  await resetDb();
});

test('every overlay gets a distinct, non-empty control token', async () => {
  const a = await makeUser();
  const b = await makeUser();
  expect(a.overlay.controlToken).toBeTruthy();
  expect(b.overlay.controlToken).toBeTruthy();
  expect(a.overlay.controlToken).not.toBe(b.overlay.controlToken);
});

test('the control token is separate from the overlay token', async () => {
  const { overlay } = await makeUser();
  expect(overlay.controlToken).not.toBe(overlay.token);
});

test('signing up creates an overlay with a control token', async () => {
  const r = await createUser('dock@test.dev', 'password123');
  expect(r).toHaveProperty('id');
  const overlay = await prisma.overlay.findFirst({ where: { userId: (r as { id: string }).id } });
  expect(overlay?.controlToken).toBeTruthy();
});

test('two overlays cannot share a control token', async () => {
  const { user, overlay } = await makeUser();
  await expect(
    prisma.overlay.create({
      data: { userId: user.id, token: newControlToken(), controlToken: overlay.controlToken },
    })
  ).rejects.toThrow();
});
