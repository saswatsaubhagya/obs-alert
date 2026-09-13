// The socials widget: a rotating plug for the streamer's other accounts. Like
// the scoreboard and the timer it is state the overlay shows continuously, but
// unlike them nothing about it moves on the server — the rotation is a timer
// in the Browser Source, so the only thing stored is this config and the only
// thing published is "the config changed".
//
// Plain module (no 'use server'), same shape as src/lib/timerConfig.ts:
// functions take userId explicitly and every value that reaches Prisma or the
// overlay is rebuilt field by field here.
import { CSS_UNSAFE } from './alertConfig';
import prisma from './db';
import { publish } from './hub';
import { SCORE_POSITIONS, type ScorePosition } from './scoreConfig';

// Same seven places the scoreboard and the timer hang in.
export const SOCIALS_POSITIONS = SCORE_POSITIONS;
export type SocialsPosition = ScorePosition;

export const SOCIALS_ORDERS = ['list', 'random'] as const;
export type SocialsOrder = (typeof SOCIALS_ORDERS)[number];

export const SOCIALS_ANIMS = ['fade', 'slide', 'pop'] as const;
export type SocialsAnim = (typeof SOCIALS_ANIMS)[number];

/** An icon as data rather than markup: the overlay builds each shape with
 *  createElementNS, so nothing here is ever handed to innerHTML. Every icon is
 *  a 24×24 line drawing — strokes only, `currentColor` — so the set stays
 *  visually consistent and inherits the handle's colour. */
export type IconShape =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number };

export const PLATFORMS = [
  'twitch',
  'youtube',
  'kick',
  'instagram',
  'tiktok',
  'x',
  'discord',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<
  Platform,
  { label: string; brand: string; icon: IconShape[] }
> = {
  twitch: {
    label: 'Twitch',
    brand: '#9146ff',
    icon: [
      { t: 'path', d: 'M4 3h16v11l-4 4h-4l-3 3H7v-3H4z' },
      { t: 'path', d: 'M10 8v4' },
      { t: 'path', d: 'M15 8v4' },
    ],
  },
  youtube: {
    label: 'YouTube',
    brand: '#ff0000',
    icon: [
      { t: 'rect', x: 2, y: 5, w: 20, h: 14, rx: 4 },
      { t: 'path', d: 'M10 9l6 3-6 3z' },
    ],
  },
  kick: {
    label: 'Kick',
    brand: '#53fc18',
    icon: [
      { t: 'path', d: 'M5 4v16' },
      { t: 'path', d: 'M5 12h3l5-8h4l-6 8 6 8h-4l-5-8' },
    ],
  },
  instagram: {
    label: 'Instagram',
    brand: '#e1306c',
    icon: [
      { t: 'rect', x: 3, y: 3, w: 18, h: 18, rx: 5 },
      { t: 'circle', cx: 12, cy: 12, r: 4 },
      { t: 'circle', cx: 17, cy: 7, r: 0.8 },
    ],
  },
  tiktok: {
    label: 'TikTok',
    brand: '#25f4ee',
    icon: [
      { t: 'path', d: 'M14 4v10a4 4 0 1 1-4-4' },
      { t: 'path', d: 'M14 4c.9 2.2 2.6 3.4 5 3.6' },
    ],
  },
  x: {
    label: 'X',
    brand: '#ffffff',
    icon: [
      { t: 'path', d: 'M5 5l14 14' },
      { t: 'path', d: 'M19 5L5 19' },
    ],
  },
  discord: {
    label: 'Discord',
    brand: '#5865f2',
    icon: [
      { t: 'path', d: 'M9 7a13 13 0 0 1 6 0' },
      { t: 'path', d: 'M9 17a13 13 0 0 0 6 0' },
      { t: 'path', d: 'M9 7c-2 2.6-2.6 6-2.2 9.2L10 18l1-1.8' },
      { t: 'path', d: 'M15 7c2 2.6 2.6 6 2.2 9.2L14 18l-1-1.8' },
      { t: 'circle', cx: 9.8, cy: 12.6, r: 1 },
      { t: 'circle', cx: 14.2, cy: 12.6, r: 1 },
    ],
  },
};

export type SocialAccount = { platform: Platform; handle: string };

export type SocialsConfig = {
  accounts: SocialAccount[];
  /** Seconds one account stays on screen. */
  showSec: number;
  /** Seconds of nothing between accounts. 0 keeps one on screen at all times. */
  gapSec: number;
  order: SocialsOrder;
  showIcon: boolean;
  /** Paint the icon in the platform's own colour instead of `color`. */
  useBrandColor: boolean;
  showLabel: boolean;
  color: string;
  labelColor: string;
  bg: string;
  font: string;
  size: number;
  pos: SocialsPosition;
  anim: SocialsAnim;
};

export const SOCIALS_DEFAULTS: SocialsConfig = {
  accounts: [],
  showSec: 6,
  gapSec: 20,
  order: 'list',
  showIcon: true,
  useBrandColor: true,
  showLabel: true,
  color: '#ffffff',
  labelColor: '#ffffff',
  bg: 'rgba(12,12,16,0.72)',
  font: 'system-ui, sans-serif',
  size: 40,
  pos: 'bottom-left',
  anim: 'slide',
};

// Handles are written with textContent, never innerHTML, so markup in them is
// inert — the caps are about layout, not safety.
export const MAX_ACCOUNTS = 12;
const HANDLE_MAX = 40;
const SIZE_MIN = 12;
const SIZE_MAX = 160;
const SHOW_MIN = 1;
const SHOW_MAX = 120;
const GAP_MAX = 3600;

// Colours, `bg` and `font` are injected verbatim into the widget's cssText,
// exactly like an alert card's style values, so they get the same refusal.
const COLOR_KEYS = ['color', 'labelColor', 'bg', 'font'] as const;
const BOOL_KEYS = ['showIcon', 'useBrandColor', 'showLabel'] as const;

export type CleanResult = { ok: true; config: SocialsConfig } | { ok: false; error: string };

function cleanAccounts(raw: unknown): { ok: true; accounts: SocialAccount[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'accounts must be an array' };
  if (raw.length > MAX_ACCOUNTS) return { ok: false, error: `accounts must hold at most ${MAX_ACCOUNTS} entries` };
  const accounts: SocialAccount[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'each account must be an object' };
    }
    const e = entry as Record<string, unknown>;
    const platform = PLATFORMS.find((p) => p === e.platform);
    if (!platform) return { ok: false, error: 'platform is not a known network' };
    if (typeof e.handle !== 'string') return { ok: false, error: 'handle must be a string' };
    const handle = e.handle.trim().slice(0, HANDLE_MAX);
    // An account with nothing to show is dropped rather than refused: it is
    // the half-filled row an editor always has one of.
    if (!handle) continue;
    // Rebuilt, not spread: anything else the row carried is left behind.
    accounts.push({ platform, handle });
  }
  return { ok: true, accounts };
}

/** Rebuilds a full config from untrusted input: session-form input on the way
 *  in, and a Json column that an older version may have written on the way
 *  out. Unknown keys — `userId` included — are dropped, not spread. */
export function cleanSocialsConfig(raw: unknown): CleanResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'config must be an object' };
  }
  const input = raw as Record<string, unknown>;
  const out: SocialsConfig = { ...SOCIALS_DEFAULTS, accounts: [] };

  if (input.accounts !== undefined) {
    const accounts = cleanAccounts(input.accounts);
    if (!accounts.ok) return accounts;
    out.accounts = accounts.accounts;
  }

  for (const k of BOOL_KEYS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return { ok: false, error: `${k} must be a boolean` };
    out[k] = v;
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

  const num = (k: 'showSec' | 'gapSec' | 'size', min: number, max: number) => {
    const v = input[k];
    if (v === undefined) return true;
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    out[k] = Math.round(Math.min(max, Math.max(min, v)));
    return true;
  };
  if (!num('showSec', SHOW_MIN, SHOW_MAX)) return { ok: false, error: 'showSec must be a number' };
  if (!num('gapSec', 0, GAP_MAX)) return { ok: false, error: 'gapSec must be a number' };
  if (!num('size', SIZE_MIN, SIZE_MAX)) return { ok: false, error: 'size must be a number' };

  if (input.order !== undefined) {
    const order = SOCIALS_ORDERS.find((o) => o === input.order);
    if (!order) return { ok: false, error: 'order is not a known rotation order' };
    out.order = order;
  }

  if (input.anim !== undefined) {
    const anim = SOCIALS_ANIMS.find((a) => a === input.anim);
    if (!anim) return { ok: false, error: 'anim is not a known animation' };
    out.anim = anim;
  }

  if (input.pos !== undefined) {
    const pos = SOCIALS_POSITIONS.find((p) => p === input.pos);
    if (!pos) return { ok: false, error: 'pos is not a known position' };
    out.pos = pos;
  }

  return { ok: true, config: out };
}

/** Read path: a stored config that fails validation (hand-edited row, a field
 *  this version no longer knows) falls back to the defaults rather than
 *  breaking the overlay. */
export function parseSocialsConfig(raw: unknown): SocialsConfig {
  if (raw === null || raw === undefined) return { ...SOCIALS_DEFAULTS, accounts: [] };
  const cleaned = cleanSocialsConfig(raw);
  return cleaned.ok ? cleaned.config : { ...SOCIALS_DEFAULTS, accounts: [] };
}

export async function getSocialsConfig(userId: string): Promise<SocialsConfig> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { socialsConfig: true } });
  return parseSocialsConfig(row?.socialsConfig);
}

/** Fans the current config out to every overlay of this user, so a saved
 *  appearance lands on stream without touching the Browser Source. */
export async function publishSocials(userId: string): Promise<SocialsConfig> {
  const config = await getSocialsConfig(userId);
  publish(userId, { widget: 'socials', config });
  return config;
}

export type SaveSocialsResult =
  | { ok: true; config: SocialsConfig }
  | { ok: false; status: 400; error: string };

export async function saveSocialsConfigFor(userId: string, raw: unknown): Promise<SaveSocialsResult> {
  const cleaned = cleanSocialsConfig(raw);
  if (!cleaned.ok) return { ok: false, status: 400, error: cleaned.error };
  // `where` is the session's own id and `data` is the rebuilt object — nothing
  // from the caller's body can select or write another tenant's row.
  await prisma.user.update({ where: { id: userId }, data: { socialsConfig: cleaned.config } });
  return { ok: true, config: cleaned.config };
}
