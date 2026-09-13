// Plain module (no 'use server'): pure(ish) functions taking userId explicitly,
// so they are unit-testable without dragging in next/cache or Auth.js.
import prisma from './db';
import { generateKey } from './keys';
import { newControlToken, newOverlayToken } from './auth-user';

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
  // ponytail: updateMany assumes a single Overlay per user — true for every
  // account today (nothing creates a second one) — and would set the SAME new
  // token on all of a user's overlays if that ever changed, breaking any but
  // one of them. Schema allows Overlay[]; if multi-overlay is ever built,
  // this needs an overlayId parameter and a where clause scoped to it, not a
  // blanket per-user updateMany.
  const token = newOverlayToken();
  await prisma.overlay.updateMany({ where: { userId }, data: { token } });
  return { token };
}

export async function rotateControlTokenFor(userId: string) {
  // Same single-overlay caveat as rotateOverlayTokenFor above: updateMany
  // would set one new token across all of a user's overlays if multi-overlay
  // is ever built, and would need an overlayId parameter then.
  const controlToken = newControlToken();
  await prisma.overlay.updateMany({ where: { userId }, data: { controlToken } });
  return { controlToken };
}
