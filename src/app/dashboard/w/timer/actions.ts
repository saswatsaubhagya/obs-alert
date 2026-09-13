'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/auth';
import { saveTimerConfigFor } from '@/lib/timerConfig';
import {
  applyTimer,
  publishTimer,
  MAX_ADJUST_MS,
  MAX_DURATION_MS,
  TIMER_ACTIONS,
  type TimerAction,
} from '@/lib/timer';

// Form entrances: session-authenticated wrappers over src/lib/timerConfig.ts
// and src/lib/timer.ts. Both validate their arguments at runtime — they arrive
// over the wire and TypeScript guarantees nothing about them — and return a
// 400-shaped result rather than throwing.

export async function saveTimerConfigAction(config: unknown) {
  const userId = await requireUserId();
  const result = await saveTimerConfigFor(userId, config);
  if (!result.ok) return result;
  // The overlay is told immediately, so a saved appearance lands on stream
  // without touching the Browser Source.
  await publishTimer(userId);
  revalidatePath('/dashboard/w/timer');
  return result;
}

export async function applyTimerAction(action: unknown, ms: unknown) {
  const userId = await requireUserId();
  const a = TIMER_ACTIONS.find((x) => x === action) as TimerAction | undefined;
  if (!a) return { ok: false as const, status: 400 as const, error: 'unknown timer action' };

  let amount = 0;
  if (a === 'start' || a === 'add') {
    if (typeof ms !== 'number' || !Number.isInteger(ms)) {
      return { ok: false as const, status: 400 as const, error: 'ms must be a whole number' };
    }
    const min = a === 'start' ? 0 : -MAX_ADJUST_MS;
    const max = a === 'start' ? MAX_DURATION_MS : MAX_ADJUST_MS;
    if (ms < min || ms > max) {
      return { ok: false as const, status: 400 as const, error: `ms must be between ${min} and ${max}` };
    }
    amount = ms;
  }

  const timer = await applyTimer(userId, a, amount);
  revalidatePath('/dashboard/w/timer');
  return { ok: true as const, timer: { running: timer.running, remainingMs: timer.remainingMs } };
}
