'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/auth';
import { saveScoreConfigFor } from '@/lib/scoreConfig';
import { adjustScore, publishScore, type ScoreTarget } from '@/lib/score';

// Form entrances: session-authenticated wrappers over src/lib/scoreConfig.ts
// and src/lib/score.ts. Both validate their arguments at runtime — they arrive
// over the wire and TypeScript guarantees nothing about them — and return a
// 400-shaped result rather than throwing.

export async function saveScoreConfigAction(config: unknown) {
  const userId = await requireUserId();
  const result = await saveScoreConfigFor(userId, config);
  if (!result.ok) return result;
  // The overlay is told immediately, so a saved appearance lands on stream
  // without touching the Browser Source.
  await publishScore(userId);
  revalidatePath('/dashboard/w/score');
  return result;
}

const TARGETS: readonly ScoreTarget[] = ['win', 'lose', 'reset'];

export async function adjustScoreAction(target: unknown, delta: unknown) {
  const userId = await requireUserId();
  const t = TARGETS.find((x) => x === target);
  if (!t) return { ok: false as const, status: 400 as const, error: 'unknown score target' };
  if (t !== 'reset' && delta !== 1 && delta !== -1) {
    return { ok: false as const, status: 400 as const, error: 'delta must be 1 or -1' };
  }
  const score = await adjustScore(userId, t, t === 'reset' ? 0 : (delta as number));
  revalidatePath('/dashboard/w/score');
  return { ok: true as const, score };
}
