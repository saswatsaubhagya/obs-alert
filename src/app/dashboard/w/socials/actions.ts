'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/auth';
import { publishSocials, saveSocialsConfigFor } from '@/lib/socialsConfig';

// Form entrance: a session-authenticated wrapper over src/lib/socialsConfig.ts.
// `config` arrives over the wire and TypeScript guarantees nothing about it, so
// it is validated there field by field and refused with a 400-shaped result
// rather than thrown.

export async function saveSocialsConfigAction(config: unknown) {
  const userId = await requireUserId();
  const result = await saveSocialsConfigFor(userId, config);
  if (!result.ok) return result;
  // Every overlay is told immediately, so a saved rotation restarts on stream
  // without touching the Browser Source.
  await publishSocials(userId);
  revalidatePath('/dashboard/w/socials');
  return result;
}
