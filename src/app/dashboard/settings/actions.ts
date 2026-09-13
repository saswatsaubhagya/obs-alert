'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/auth';
import {
  createIngestKeyFor,
  revokeIngestKeyFor,
  rotateOverlayTokenFor,
  rotateControlTokenFor,
} from '@/lib/settings';

// Form entrances: session-authenticated wrappers over src/lib/settings.ts.

export async function createKeyAction(_prev: unknown, form: FormData) {
  const userId = await requireUserId();
  const { plain } = await createIngestKeyFor(userId, String(form.get('name') ?? ''));
  revalidatePath('/dashboard/settings');
  return { plain };
}

export async function revokeKeyAction(form: FormData) {
  const userId = await requireUserId();
  await revokeIngestKeyFor(userId, String(form.get('keyId') ?? ''));
  revalidatePath('/dashboard/settings');
}

export async function rotateTokenAction() {
  const userId = await requireUserId();
  await rotateOverlayTokenFor(userId);
  revalidatePath('/dashboard/settings');
}

export async function rotateControlTokenAction() {
  const userId = await requireUserId();
  await rotateControlTokenFor(userId);
  revalidatePath('/dashboard/settings');
}
