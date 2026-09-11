// Plain module (no 'use server'): pure(ish) functions taking userId explicitly,
// so they are unit-testable without dragging in next/cache or Auth.js.
import prisma from './db';
import { generateKey } from './keys';
import { newOverlayToken } from './auth-user';

export async function createIngestKeyFor(userId: string, name: string) {
  const k = generateKey();
  await prisma.ingestKey.create({
    data: { userId, name: name.trim() || 'Untitled key', hash: k.hash, prefix: k.prefix },
  });
  return { plain: k.plain, prefix: k.prefix }; // plaintext returned once, never stored
}

export async function revokeIngestKeyFor(userId: string, keyId: string) {
  // userId in the filter is the tenant check: a mismatch updates nothing.
  const { count } = await prisma.ingestKey.updateMany({
    where: { id: keyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { ok: count === 1 };
}

export async function rotateOverlayTokenFor(userId: string) {
  const token = newOverlayToken();
  await prisma.overlay.updateMany({ where: { userId }, data: { token } });
  return { token };
}
