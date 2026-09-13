// Plain module (no 'use server'): pure(ish) functions taking userId explicitly,
// so they are unit-testable without dragging in next/cache or Auth.js.
// Mirrors src/lib/settings.ts.
import prisma from './db';
import { BUILT_IN, PRESETS, type Style } from './eventTypes';
import { sendAlert, type Source } from './sendAlert';

export type ConfigPatch = Partial<{
  enabled: boolean;
  template: string;
  titleTemplate: string | null;
  style: Style;
  durationMs: number;
  imageUrl: string | null;
  soundUrl: string | null;
  soundVolume: number;
  minAmount: number | null;
  locale: string;
}>;

export type SaveResult = { ok: true } | { ok: false; status: 400; error: string };

// ---------------------------------------------------------------------------
// Runtime validation of the patch.
//
// `ConfigPatch` is a compile-time type and nothing more. saveConfigFor is
// reached from saveConfigAction, a 'use server' export, so its arguments are
// wire input deserialized from a request body: a caller can send any JSON at
// all. Prisma's unchecked upsert input accepts a scalar `userId`, so spreading
// an unvalidated patch into `update`/`create` let an authenticated user write
// to *another user's* AlertConfig row (`{ userId: victimId }`) and put
// arbitrary text, images and audio on someone else's live stream. Everything
// below exists to make sure only the fields listed here, with the value types
// listed here, ever reach Prisma.
// ---------------------------------------------------------------------------

const STYLE_STRINGS = ['accent', 'bg', 'fg', 'font', 'pos'] as const;
const STYLE_NUMBERS = ['size', 'width', 'radius'] as const;
const ANIMS: Style['anim'][] = ['fade', 'slide', 'pop'];

// Style strings are injected verbatim into the overlay card's `style.cssText`
// (see OverlayClient.tsx), so a value like `red;background:url(https://evil/x)`
// would be CSS injection. Two classes of character are refused: the ones that
// end a declaration or a block (so a value can never become a new property),
// and the functions that fetch a remote resource (`--bg` is used as
// `background: var(--bg)`, which *would* load a url()). Every legitimate value
// — `#31d0aa`, `rgba(12,12,16,0.86)`, `linear-gradient(...)`,
// `system-ui, sans-serif` — passes.
export const CSS_UNSAFE = /[;{}<>\\]|[\r\n]|\/\*|\b(?:url|image-set|-webkit-image-set|expression|element|src)\s*\(/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cleanStyle(input: unknown): { ok: true; style: Partial<Style> } | { ok: false; error: string } {
  if (!isPlainObject(input)) return { ok: false, error: 'style must be an object' };
  const out: Record<string, unknown> = {};
  for (const k of STYLE_STRINGS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') return { ok: false, error: `style.${k} must be a string` };
    if (CSS_UNSAFE.test(v)) {
      return { ok: false, error: `style.${k} contains characters that are not allowed in a style value` };
    }
    out[k] = v;
  }
  for (const k of STYLE_NUMBERS) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `style.${k} must be a number` };
    out[k] = v;
  }
  if (input.anim !== undefined) {
    if (!ANIMS.includes(input.anim as Style['anim'])) return { ok: false, error: 'style.anim is not a known animation' };
    out.anim = input.anim;
  }
  if (input.preset !== undefined) {
    if (!PRESETS.includes(input.preset as Style['preset'])) {
      return { ok: false, error: 'style.preset is not a known animation preset' };
    }
    out.preset = input.preset;
  }
  // Every other key — `userId` included — is dropped here.
  return { ok: true, style: out as Partial<Style> };
}

function nullableString(v: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: `${field} must be a string or null` };
  return { ok: true, value: v };
}

function finiteNumber(v: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `${field} must be a number` };
  return { ok: true, value: v };
}

/** The only shape allowed through to Prisma. Built field by field from an
 *  allow-list; anything not named here (notably `userId`, `id`, `eventTypeKey`)
 *  cannot survive, whatever the caller sent. */
type CleanPatch = {
  enabled?: boolean;
  template?: string;
  titleTemplate?: string | null;
  style?: Partial<Style>;
  durationMs?: number;
  imageUrl?: string | null;
  soundUrl?: string | null;
  soundVolume?: number;
  minAmount?: number | null;
  locale?: string;
};

export function cleanConfigPatch(input: unknown): { ok: true; patch: CleanPatch } | { ok: false; error: string } {
  if (!isPlainObject(input)) return { ok: false, error: 'patch must be an object' };
  const p: CleanPatch = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean' };
    p.enabled = input.enabled;
  }
  if (input.template !== undefined) {
    if (typeof input.template !== 'string') return { ok: false, error: 'template must be a string' };
    p.template = input.template;
  }
  if (input.locale !== undefined) {
    if (typeof input.locale !== 'string') return { ok: false, error: 'locale must be a string' };
    p.locale = input.locale;
  }
  for (const k of ['titleTemplate', 'imageUrl', 'soundUrl'] as const) {
    if (input[k] === undefined) continue;
    const r = nullableString(input[k], k);
    if (!r.ok) return r;
    p[k] = r.value;
  }
  for (const k of ['durationMs', 'soundVolume'] as const) {
    if (input[k] === undefined) continue;
    const r = finiteNumber(input[k], k);
    if (!r.ok) return r;
    p[k] = Math.round(r.value);
  }
  if (input.minAmount !== undefined) {
    if (input.minAmount === null) p.minAmount = null;
    else {
      const r = finiteNumber(input.minAmount, 'minAmount');
      if (!r.ok) return r;
      p.minAmount = Math.round(r.value);
    }
  }
  if (input.style !== undefined) {
    const r = cleanStyle(input.style);
    if (!r.ok) return r;
    p.style = r.style;
  }
  return { ok: true, patch: p };
}

export async function saveConfigFor(
  userId: string,
  eventTypeKey: string,
  patch: unknown
): Promise<SaveResult> {
  // eventTypeKey is wire input too: an unknown key must be a 400, not a throw
  // that surfaces to the client as an opaque server-action digest error.
  // `Object.hasOwn` (not `BUILT_IN[eventTypeKey]`) because a plain object
  // literal makes `BUILT_IN['toString']`/`['constructor']`/`['__proto__']`
  // truthy — those keys pass a truthiness check but have no `.defaults`,
  // which then throws instead of returning this 400.
  if (!Object.hasOwn(BUILT_IN, eventTypeKey)) return { ok: false, status: 400, error: 'unknown event type' };
  const t = BUILT_IN[eventTypeKey];

  const cleaned = cleanConfigPatch(patch);
  if (!cleaned.ok) return { ok: false, status: 400, error: cleaned.error };
  const data = cleaned.patch;

  await prisma.alertConfig.upsert({
    where: { userId_eventTypeKey: { userId, eventTypeKey } },
    update: data,
    create: {
      eventTypeKey,
      template: t.defaults.template,
      titleTemplate: t.defaults.titleTemplate,
      style: t.defaults.style,
      durationMs: t.defaults.durationMs,
      ...data,
      // Belt and braces: even if `data` ever regained a `userId`, the trusted
      // one wins because it is spread last.
      userId,
    },
  });
  return { ok: true };
}

// Samples cover every field name used across BUILT_IN. `message` is included
// here because sendFromDashboard/sendAlert still accept and log it as a
// payload field — only the editor's template variable chips (Ruling 11)
// exclude it, because renderAlert never lets it feed text/title.
const SAMPLES: Record<string, string | number> = {
  name: 'TestViewer',
  amount: 500,
  currency: 'USD',
  message: 'this is a test alert',
  months: 3,
  tier: '1',
  viewers: 42,
  opponent: 'Team Red',
};

/** Returns `{}` for an unknown key rather than throwing: the only caller is
 *  testFireAction, a server action, and its argument is client input.
 *  sendAlert then rejects the unknown type with its own 400. */
export function sampleValues(eventTypeKey: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of BUILT_IN[eventTypeKey]?.fields ?? []) {
    if (SAMPLES[f.name] !== undefined) out[f.name] = SAMPLES[f.name];
  }
  return out;
}

export async function sendFromDashboard(userId: string, body: unknown, source: Source) {
  return sendAlert(userId, body, source);
}
