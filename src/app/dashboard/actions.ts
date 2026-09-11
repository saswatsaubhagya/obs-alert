'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/auth';
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
  await saveConfigFor(userId, eventTypeKey, patch);
  revalidatePath('/dashboard');
  return { ok: true as const };
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
