// The timer widget's appearance, plus the one clock-formatting function the
// overlay, the editor and the tests all share. Plain module (no 'use server'),
// same shape as src/lib/scoreConfig.ts: functions take userId explicitly and
// every value that reaches Prisma or the overlay is rebuilt field by field.
import { CSS_UNSAFE } from './alertConfig';
import prisma from './db';
import { SCORE_POSITIONS, type ScorePosition } from './scoreConfig';

// The timer hangs in the same seven places the scoreboard does; one list, so
// the two widgets cannot drift apart.
export const TIMER_POSITIONS = SCORE_POSITIONS;
export type TimerPosition = ScorePosition;

export const TIMER_FORMATS = ['auto', 'mm:ss', 'hh:mm:ss'] as const;
export type TimerFormat = (typeof TIMER_FORMATS)[number];

export type TimerConfig = {
  showLabel: boolean;
  label: string;
  endText: string;
  format: TimerFormat;
  /** Seconds left at which `warnColor` takes over. 0 disables the warning. */
  warnAtSec: number;
  hideAtZero: boolean;
  color: string;
  warnColor: string;
  labelColor: string;
  bg: string;
  font: string;
  size: number;
  pos: TimerPosition;
};

export const TIMER_DEFAULTS: TimerConfig = {
  showLabel: true,
  label: 'STARTING SOON',
  endText: "LET'S GO",
  format: 'auto',
  warnAtSec: 60,
  hideAtZero: true,
  color: '#ffffff',
  warnColor: '#ff5c8a',
  labelColor: '#ffffff',
  bg: 'rgba(12,12,16,0.72)',
  font: 'system-ui, sans-serif',
  size: 64,
  pos: 'top',
};

// Text is written with textContent, never innerHTML, so markup in it is inert —
// the caps are about layout, not safety.
const LABEL_MAX = 24;
const SIZE_MIN = 16;
const SIZE_MAX = 200;
const WARN_MAX = 3600;

// Colours, `bg` and `font` are injected verbatim into the clock's cssText,
// exactly like an alert card's style values, so they get the same refusal.
const COLOR_KEYS = ['color', 'warnColor', 'labelColor', 'bg', 'font'] as const;
const TEXT_KEYS = ['label', 'endText'] as const;
const BOOL_KEYS = ['showLabel', 'hideAtZero'] as const;

export type CleanResult = { ok: true; config: TimerConfig } | { ok: false; error: string };

/** Rebuilds a full config from untrusted input: session-form input on the way
 *  in, and a Json column that an older version may have written on the way
 *  out. Unknown keys — `userId` included — are dropped, not spread. */
export function cleanTimerConfig(raw: unknown): CleanResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'config must be an object' };
  }
  const input = raw as Record<string, unknown>;
  const out: TimerConfig = { ...TIMER_DEFAULTS };

  for (const k of BOOL_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return { ok: false, error: `${k} must be a boolean` };
    out[k] = v;
  }

  for (const k of TEXT_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k} must be a string` };
    out[k] = v.slice(0, LABEL_MAX);
  }

  for (const k of COLOR_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k} must be a string` };
    if (CSS_UNSAFE.test(v)) {
      return { ok: false, error: `${k} contains characters that are not allowed in a style value` };
    }
    out[k] = v;
  }

  if (input.size !== undefined) {
    if (typeof input.size !== 'number' || !Number.isFinite(input.size)) {
      return { ok: false, error: 'size must be a number' };
    }
    out.size = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, input.size)));
  }

  if (input.warnAtSec !== undefined) {
    if (typeof input.warnAtSec !== 'number' || !Number.isFinite(input.warnAtSec)) {
      return { ok: false, error: 'warnAtSec must be a number' };
    }
    out.warnAtSec = Math.round(Math.min(WARN_MAX, Math.max(0, input.warnAtSec)));
  }

  if (input.format !== undefined) {
    const f = TIMER_FORMATS.find((x) => x === input.format);
    if (!f) return { ok: false, error: 'format is not a known clock format' };
    out.format = f;
  }

  if (input.pos !== undefined) {
    const pos = TIMER_POSITIONS.find((p) => p === input.pos);
    if (!pos) return { ok: false, error: 'pos is not a known position' };
    out.pos = pos;
  }

  return { ok: true, config: out };
}

/** Read path: a stored config that fails validation (hand-edited row, a field
 *  this version no longer knows) falls back to the defaults rather than
 *  breaking the overlay. */
export function parseTimerConfig(raw: unknown): TimerConfig {
  if (raw === null || raw === undefined) return { ...TIMER_DEFAULTS };
  const cleaned = cleanTimerConfig(raw);
  return cleaned.ok ? cleaned.config : { ...TIMER_DEFAULTS };
}

export type SaveTimerResult = { ok: true; config: TimerConfig } | { ok: false; status: 400; error: string };

export async function saveTimerConfigFor(userId: string, raw: unknown): Promise<SaveTimerResult> {
  const cleaned = cleanTimerConfig(raw);
  if (!cleaned.ok) return { ok: false, status: 400, error: cleaned.error };
  // `where` is the session's own id and `data` is the rebuilt object — nothing
  // from the caller's body can select or write another tenant's row.
  await prisma.user.update({ where: { id: userId }, data: { timerConfig: cleaned.config } });
  return { ok: true, config: cleaned.config };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Milliseconds to a clock face. `auto` drops the hours until there are any,
 *  so a five-minute break reads `04:59` and a subathon reads `12:04:59`.
 *  Rounds up: one whole second is on screen for every second remaining, and
 *  `00:00` shows only when the timer has actually finished. */
export function formatClock(ms: number, format: TimerFormat = 'auto'): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (format === 'hh:mm:ss' || (format === 'auto' && h > 0)) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  // mm:ss past an hour keeps counting minutes rather than silently wrapping.
  return `${pad(h * 60 + m)}:${pad(s)}`;
}
