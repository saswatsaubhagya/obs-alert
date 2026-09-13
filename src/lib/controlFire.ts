// The OBS control dock's one endpoint. Deliberately narrower than
// src/lib/apiAlert.ts: its credential travels in a URL that lives pinned in a
// dock and is easy to leak on stream, so it can fire result widgets and
// nothing else.
import prisma from './db';
import { BUILT_IN, EVENT_TYPE_KEYS } from './eventTypes';
import { take } from './ratelimit';
import { sendAlert } from './sendAlert';

const MAX_BODY = 64 * 1024;
const OPPONENT_MAX = 120;

/** Derived, never hardcoded: a new result-widget type is fireable from the
 *  dock the moment it exists, and an alert type never becomes fireable. */
export const RESULT_KEYS = EVENT_TYPE_KEYS.filter((k) => BUILT_IN[k].widget === 'result');

export async function handleControlFire(req: Request, token: string): Promise<Response> {
  // Tracks the overlay id (never the token) so a failure after resolution can
  // still be logged against something stable.
  let overlayId: string | undefined;

  try {
    const overlay = token.trim()
      ? await prisma.overlay.findUnique({ where: { controlToken: token.trim() } })
      : null;
    // Identical body for missing and unknown: no oracle for token probing.
    if (!overlay) return Response.json({ error: 'invalid control token' }, { status: 401 });
    overlayId = overlay.id;

    const gate = take(`control:${overlay.id}`);
    if (!gate.ok) {
      return Response.json(
        { error: 'rate limit exceeded' },
        { status: 429, headers: { 'retry-after': String(gate.retryAfter) } }
      );
    }

    const raw = await req.text();
    if (Buffer.byteLength(raw) > MAX_BODY) {
      return Response.json({ error: 'body too large' }, { status: 413 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const type = (parsed as Record<string, unknown>).type;
    const key = typeof type === 'string' ? type : '';
    // Object.hasOwn, not a truthy check: BUILT_IN['toString'] is truthy and
    // would reach sendAlert as a type with no fields, throwing a 500.
    if (!Object.hasOwn(BUILT_IN, key) || BUILT_IN[key].widget !== 'result') {
      return Response.json(
        { error: 'this endpoint only fires result widgets', known: RESULT_KEYS },
        { status: 400 }
      );
    }

    const opponent = (parsed as Record<string, unknown>).opponent;
    // Allow-list, not pass-through: the caller's body is wire input from a URL
    // credential that is easy to leak, and every field forwarded is something a
    // leaked dock can put on screen. `message` is deliberately NOT forwarded —
    // the dock does not send it, and it renders as its own line on the overlay.
    const body = {
      type: key,
      ...(typeof opponent === 'string' && opponent.trim()
        ? { opponent: opponent.trim().slice(0, OPPONENT_MAX) }
        : {}),
    };
    const result = await sendAlert(overlay.userId, body, 'control');
    console.log(`control ${overlay.id} -> ${result.status}`);
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    // Never let an exception reach Next's default error handling: it may log
    // the request URL, and the URL carries the control token. Log the overlay
    // id and the message only.
    const message = err instanceof Error ? err.message : String(err);
    console.error(overlayId ? `control ${overlayId} error: ${message}` : `control error: ${message}`);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
