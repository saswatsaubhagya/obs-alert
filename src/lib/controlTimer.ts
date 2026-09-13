// The dock's timer endpoint: read the clock (GET) and move it (POST).
// Deliberately as narrow as src/lib/controlScore.ts — its credential travels
// in a URL pinned in an OBS dock, so a leaked dock can start, pause or nudge a
// countdown and nothing else.
import { authorizeControl } from './control';
import {
  applyTimer,
  getTimer,
  MAX_ADJUST_MS,
  MAX_DURATION_MS,
  TIMER_ACTIONS,
  type TimerAction,
} from './timer';

const MAX_BODY = 64 * 1024;

export async function handleControlTimer(req: Request, token: string): Promise<Response> {
  let overlayId: string | undefined;

  try {
    const auth = await authorizeControl(token);
    if (auth instanceof Response) return auth;
    overlayId = auth.id;

    if (req.method === 'GET') return Response.json(await getTimer(auth.userId));

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

    // Allow-list, built field by field: nothing from the body reaches the
    // database except an action drawn from TIMER_ACTIONS and a bounded integer.
    const { type, ms } = parsed as Record<string, unknown>;
    const action = TIMER_ACTIONS.find((a) => a === type) as TimerAction | undefined;
    if (!action) {
      return Response.json({ error: 'unknown timer action', known: TIMER_ACTIONS }, { status: 400 });
    }

    let amount = 0;
    if (action === 'start' || action === 'add') {
      if (typeof ms !== 'number' || !Number.isInteger(ms)) {
        return Response.json({ error: 'ms must be a whole number of milliseconds' }, { status: 400 });
      }
      const min = action === 'start' ? 0 : -MAX_ADJUST_MS;
      const max = action === 'start' ? MAX_DURATION_MS : MAX_ADJUST_MS;
      if (ms < min || ms > max) {
        return Response.json({ error: `ms must be between ${min} and ${max}` }, { status: 400 });
      }
      amount = ms;
    }

    const state = await applyTimer(auth.userId, action, amount);
    console.log(`control ${auth.id} timer ${action} -> ${state.running ? 'running' : 'stopped'} ${state.remainingMs}ms`);
    return Response.json(state);
  } catch (err) {
    // Never let an exception reach Next's default error handling: it may log
    // the request URL, and the URL carries the control token.
    const message = err instanceof Error ? err.message : String(err);
    console.error(overlayId ? `control ${overlayId} timer error: ${message}` : `control timer error: ${message}`);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
