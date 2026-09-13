// The scoreboard widget's appearance. Plain module (no 'use server'), same
// shape as src/lib/alertConfig.ts: functions take userId explicitly and every
// value that reaches Prisma or the overlay is rebuilt field by field here.
import { CSS_UNSAFE } from './alertConfig';
import prisma from './db';

export const SCORE_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'center',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type ScorePosition = (typeof SCORE_POSITIONS)[number];

export type ScoreConfig = {
  showLabels: boolean;
  winLabel: string;
  lossLabel: string;
  separator: string;
  winColor: string;
  lossColor: string;
  labelColor: string;
  bg: string;
  font: string;
  size: number;
  pos: ScorePosition;
};

export const SCORE_DEFAULTS: ScoreConfig = {
  showLabels: true,
  winLabel: 'WINS',
  lossLabel: 'LOSSES',
  separator: '–',
  winColor: '#31d0aa',
  lossColor: '#ff5c8a',
  labelColor: '#ffffff',
  bg: 'rgba(12,12,16,0.72)',
  font: 'system-ui, sans-serif',
  size: 64,
  pos: 'top',
};

// Labels are written with textContent, never innerHTML, so markup in them is
// inert — the cap is about layout, not safety.
const LABEL_MAX = 24;
const SEPARATOR_MAX = 4;
const SIZE_MIN = 16;
const SIZE_MAX = 200;

// Colours, `bg` and `font` are injected verbatim into the board's cssText,
// exactly like an alert card's style values, so they get the same refusal.
const COLOR_KEYS = ['winColor', 'lossColor', 'labelColor', 'bg', 'font'] as const;
const TEXT_KEYS = ['winLabel', 'lossLabel', 'separator'] as const;

export type CleanResult = { ok: true; config: ScoreConfig } | { ok: false; error: string };

/** Rebuilds a full config from untrusted input: session-form input on the way
 *  in, and a Json column that an older version may have written on the way
 *  out. Unknown keys — `userId` included — are dropped, not spread. */
export function cleanScoreConfig(raw: unknown): CleanResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'config must be an object' };
  }
  const input = raw as Record<string, unknown>;
  const out: ScoreConfig = { ...SCORE_DEFAULTS };

  if (input.showLabels !== undefined) {
    if (typeof input.showLabels !== 'boolean') return { ok: false, error: 'showLabels must be a boolean' };
    out.showLabels = input.showLabels;
  }

  for (const k of TEXT_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `${k} must be a string` };
    out[k] = v.slice(0, k === 'separator' ? SEPARATOR_MAX : LABEL_MAX);
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

  if (input.pos !== undefined) {
    const pos = SCORE_POSITIONS.find((p) => p === input.pos);
    if (!pos) return { ok: false, error: 'pos is not a known position' };
    out.pos = pos;
  }

  return { ok: true, config: out };
}

/** Read path: a stored config that fails validation (hand-edited row, a field
 *  this version no longer knows) falls back to the defaults rather than
 *  breaking the overlay. */
export function parseScoreConfig(raw: unknown): ScoreConfig {
  if (raw === null || raw === undefined) return { ...SCORE_DEFAULTS };
  const cleaned = cleanScoreConfig(raw);
  return cleaned.ok ? cleaned.config : { ...SCORE_DEFAULTS };
}

export type SaveScoreResult = { ok: true; config: ScoreConfig } | { ok: false; status: 400; error: string };

export async function saveScoreConfigFor(userId: string, raw: unknown): Promise<SaveScoreResult> {
  const cleaned = cleanScoreConfig(raw);
  if (!cleaned.ok) return { ok: false, status: 400, error: cleaned.error };
  // `where` is the session's own id and `data` is the rebuilt object — nothing
  // from the caller's body can select or write another tenant's row.
  await prisma.user.update({ where: { id: userId }, data: { scoreConfig: cleaned.config } });
  return { ok: true, config: cleaned.config };
}
