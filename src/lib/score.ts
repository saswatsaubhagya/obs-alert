// The scoreboard widget's state. Unlike an alert, a score is not an event that
// plays and disappears: it is a value the overlay shows continuously, so it
// lives in a column and every change is fanned out on the same hub.
import prisma from './db';
import { publish } from './hub';
import { parseScoreConfig, type ScoreConfig } from './scoreConfig';

export type Score = { wins: number; losses: number };
/** What an overlay needs to draw the board: the tally plus its appearance. */
export type ScoreState = Score & { config: ScoreConfig };
export type ScoreTarget = 'win' | 'lose' | 'reset';

export async function getScore(userId: string): Promise<ScoreState> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { wins: true, losses: true, scoreConfig: true },
  });
  return {
    wins: u?.wins ?? 0,
    losses: u?.losses ?? 0,
    config: parseScoreConfig(u?.scoreConfig),
  };
}

/** Fans the current state out untouched — used after an appearance change,
 *  which every overlay has to be told about but which moves no counter. */
export async function publishScore(userId: string): Promise<ScoreState> {
  const state = await getScore(userId);
  publish(userId, { widget: 'score', ...state });
  return state;
}

/** Applies a bounded change and fans the new score out to every overlay of
 *  this user. Counters never go below zero — a decrement at 0 is a no-op.
 *
 *  ponytail: read-then-write rather than an atomic `increment`. Ceiling: two
 *  docks clicking within the same round trip can lose one click. Upgrade path:
 *  a single `UPDATE ... SET wins = GREATEST(0, wins + $1) RETURNING *`. */
export async function adjustScore(userId: string, target: ScoreTarget, delta: number): Promise<ScoreState> {
  const cur = await getScore(userId);
  // Rebuilt field by field, never spread from `cur`: `cur` also carries the
  // config, and a spread would send it to Prisma as an unknown column.
  const next: Score =
    target === 'reset'
      ? { wins: 0, losses: 0 }
      : target === 'win'
        ? { wins: Math.max(0, cur.wins + delta), losses: cur.losses }
        : { wins: cur.wins, losses: Math.max(0, cur.losses + delta) };
  await prisma.user.update({ where: { id: userId }, data: next });
  const state: ScoreState = { ...next, config: cur.config };
  publish(userId, { widget: 'score', ...state });
  return state;
}
