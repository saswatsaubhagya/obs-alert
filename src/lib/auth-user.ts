import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import prisma from './db';

const normalize = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function newOverlayToken() {
  return randomBytes(32).toString('base64url');
}

export async function createUser(email: string, password: string) {
  const e = normalize(email);
  if (!EMAIL.test(e)) return { error: 'invalid email' };
  if (password.length < 8) return { error: 'password must be at least 8 characters' };
  if (await prisma.user.findUnique({ where: { email: e } })) {
    return { error: 'email already registered' };
  }
  try {
    const user = await prisma.user.create({
      data: {
        email: e,
        passwordHash: await hash(password), // argon2id is @node-rs/argon2's default
        overlays: { create: { token: newOverlayToken() } },
      },
    });
    return { id: user.id };
  } catch (err) {
    // Backstop for a concurrent signup racing the pre-check above: without
    // this, a duplicate email surfaces a raw P2002 instead of the friendly
    // error the pre-check normally returns.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'email already registered' };
    }
    throw err;
  }
}

export async function verifyCredentials(email: string, password: string) {
  if (!email || !password) return null;
  const user = await prisma.user.findUnique({ where: { email: normalize(email) } });
  if (!user) return null;
  try {
    if (!(await verify(user.passwordHash, password))) return null;
  } catch {
    return null; // stored hash unreadable
  }
  return { id: user.id, email: user.email };
}
