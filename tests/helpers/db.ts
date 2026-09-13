import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';

export async function resetDb() {
  // order matters: children before parents
  await prisma.alertLog.deleteMany();
  await prisma.alertConfig.deleteMany();
  await prisma.ingestKey.deleteMany();
  await prisma.overlay.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(email = `u${randomBytes(4).toString('hex')}@test.dev`) {
  const user = await prisma.user.create({ data: { email, passwordHash: 'x' } });
  const overlay = await prisma.overlay.create({
    data: {
      userId: user.id,
      token: randomBytes(32).toString('base64url'),
      controlToken: randomBytes(32).toString('base64url'),
    },
  });
  return { user, overlay };
}
