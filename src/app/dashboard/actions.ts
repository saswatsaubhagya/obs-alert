'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId, signOut } from '@/auth';
import {
  sampleValues,
  saveConfigFor,
  sendFromDashboard,
  type ConfigPatch,
} from '@/lib/alertConfig';

export type { ConfigPatch };

// Form entrances: session-authenticated wrappers over src/lib/alertConfig.ts.

export async function saveConfigAction(eventTypeKey: string, patch: ConfigPatch) {
  const userId = await requireUserId();
  // saveConfigFor validates both arguments at runtime — they arrive over the
  // wire and TypeScript guarantees nothing about them — and returns a
  // 400-shaped result rather than throwing.
  const result = await saveConfigFor(userId, eventTypeKey, patch);
  if (!result.ok) return result;
  revalidatePath('/dashboard/w/alerts');
  revalidatePath('/dashboard/w/win-loss');
  return result;
}

export async function testFireAction(eventTypeKey: string) {
  const userId = await requireUserId();
  return sendFromDashboard(userId, { type: eventTypeKey, ...sampleValues(eventTypeKey) }, 'test');
}

export async function manualSendAction(form: FormData) {
  const userId = await requireUserId();
  const body: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && v) body[k] = v;
  return sendFromDashboard(userId, body, 'dashboard');
}

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}
