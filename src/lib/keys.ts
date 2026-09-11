import { createHash, randomBytes } from 'node:crypto';
import prisma from './db';

/** sha256, not a slow KDF: keys are 32 random bytes, not human passwords, and
 *  lookup is on the alert hot path. */
export function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function generateKey() {
  const plain = `oba_${randomBytes(32).toString('base64url')}`;
  return { plain, hash: hashKey(plain), prefix: plain.slice(0, 12) };
}

export async function resolveKey(plain: string) {
  if (!plain) return null;
  const row = await prisma.ingestKey.findUnique({ where: { hash: hashKey(plain) } });
  if (!row || row.revokedAt) return null;
  await prisma.ingestKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { userId: row.userId, keyId: row.id, prefix: row.prefix };
}
