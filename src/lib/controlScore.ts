// The dock's scoreboard endpoint: read the score (GET) and nudge it by one
// (POST). Deliberately as narrow as src/lib/controlFire.ts — its credential
// travels in a URL pinned in an OBS dock, so a leaked dock can move a counter
// by one per request and nothing else.
import { authorizeControl } from './control';
import { adjustScore, getScore, type ScoreTarget } from './score';

const MAX_BODY = 64 * 1024;
const TARGETS: readonly ScoreTarget[] = ['win', 'lose', 'reset'];

export async function handleControlScore(req: Request, token: string): Promise<Response> {
  let overlayId: string | undefined;

  try {
    const auth = await authorizeControl(token);
    if (auth instanceof Response) return auth;
    overlayId = auth.id;

    if (req.method === 'GET') return Response.json(await getScore(auth.userId));

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
    // database except a target drawn from TARGETS and a delta of exactly ±1.
    const { type, delta } = parsed as Record<string, unknown>;
    const target = TARGETS.find((t) => t === type);
    if (!target) {
      return Response.json({ error: 'unknown score target', known: TARGETS }, { status: 400 });
    }
    if (target !== 'reset' && delta !== 1 && delta !== -1) {
      return Response.json({ error: 'delta must be 1 or -1' }, { status: 400 });
    }

    const score = await adjustScore(auth.userId, target, target === 'reset' ? 0 : (delta as number));
    console.log(`control ${auth.id} score -> ${score.wins}-${score.losses}`);
    return Response.json(score);
  } catch (err) {
    // Never let an exception reach Next's default error handling: it may log
    // the request URL, and the URL carries the control token.
    const message = err instanceof Error ? err.message : String(err);
    console.error(overlayId ? `control ${overlayId} score error: ${message}` : `control score error: ${message}`);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
