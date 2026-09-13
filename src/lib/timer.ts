// The timer widget's state. Like the scoreboard it is a value the overlay
// shows continuously rather than an event that plays and disappears, so it
// lives in columns and every change is fanned out on the same hub.
//
// Two columns, one invariant: `timerEndsAt` non-null means running and the
// clock ends at that instant; null means stopped or paused, with what is left
// parked in `timerRemainingMs`. The wire frame carries `remainingMs` as of the
// moment it was published and the overlay ticks down locally from there, so
// nothing depends on the streaming PC's clock agreeing with the server's.
import prisma from './db';
import { publish } from './hub';
import { parseTimerConfig, type TimerConfig } from './timerConfig';

export type TimerState = { running: boolean; remainingMs: number; config: TimerConfig };
export type TimerAction = 'start' | 'pause' | 'resume' | 'add' | 'reset';
export const TIMER_ACTIONS: readonly TimerAction[] = ['start', 'pause', 'resume', 'add', 'reset'];

/** A single countdown may run for a day. Long enough for a subathon session,
 *  short enough that a fat-fingered value cannot park a clock for a year. */
export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
/** One nudge of the ± buttons, in either direction. */
export const MAX_ADJUST_MS = 60 * 60 * 1000;

type Row = { timerEndsAt: Date | null; timerRemainingMs: number; timerConfig: unknown };

function stateOf(row: Row | null, now: number): TimerState {
  const config = parseTimerConfig(row?.timerConfig);
  if (!row?.timerEndsAt) {
    return { running: false, remainingMs: Math.max(0, row?.timerRemainingMs ?? 0), config };
  }
  return { running: true, remainingMs: Math.max(0, row.timerEndsAt.getTime() - now), config };
}

export async function getTimer(userId: string, now = Date.now()): Promise<TimerState> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { timerEndsAt: true, timerRemainingMs: true, timerConfig: true },
  });
  return stateOf(row, now);
}

/** Fans the current state out untouched — used after an appearance change,
 *  which every overlay has to be told about but which moves no clock. */
export async function publishTimer(userId: string): Promise<TimerState> {
  const state = await getTimer(userId);
  publish(userId, { widget: 'timer', ...state });
  return state;
}

/** Applies one bounded transition and fans the new state out to every overlay
 *  of this user. `ms` is the start duration for 'start' and the signed nudge
 *  for 'add'; the other actions ignore it. Nothing ever goes below zero, and
 *  nothing is ever scheduled further out than MAX_DURATION_MS.
 *
 *  ponytail: read-then-write rather than one SQL statement, same as
 *  adjustScore. Ceiling: two docks clicking inside one round trip can lose a
 *  nudge. Upgrade path: a single UPDATE ... RETURNING. */
export async function applyTimer(userId: string, action: TimerAction, ms = 0): Promise<TimerState> {
  const now = Date.now();
  const cur = await getTimer(userId, now);
  const clamp = (v: number) => Math.min(MAX_DURATION_MS, Math.max(0, v));

  // Rebuilt field by field, never spread from `cur`: `cur` carries the config
  // too, and a spread would send it to Prisma as an unknown column.
  let endsAt: Date | null = null;
  let remainingMs = 0;

  switch (action) {
    case 'start':
      remainingMs = clamp(ms);
      endsAt = remainingMs > 0 ? new Date(now + remainingMs) : null;
      break;
    case 'pause':
      remainingMs = cur.remainingMs;
      break;
    case 'resume':
      remainingMs = cur.remainingMs;
      // Resuming a finished clock is a no-op rather than an instant re-fire.
      endsAt = remainingMs > 0 ? new Date(now + remainingMs) : null;
      break;
    case 'add': {
      remainingMs = clamp(cur.remainingMs + ms);
      // Adding time to a running clock keeps it running — including one that
      // has just hit zero but was never paused, which is what "+5 min" on a
      // dead break timer is asking for. Adding to a paused or cleared clock
      // parks the new time without starting it.
      endsAt = cur.running && remainingMs > 0 ? new Date(now + remainingMs) : null;
      break;
    }
    case 'reset':
      break;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { timerEndsAt: endsAt, timerRemainingMs: endsAt ? 0 : remainingMs },
  });
  const state: TimerState = { running: endsAt !== null, remainingMs, config: cur.config };
  publish(userId, { widget: 'timer', ...state });
  return state;
}
