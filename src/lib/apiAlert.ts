import { resolveKey } from './keys';
import { take } from './ratelimit';
import { sendAlert } from './sendAlert';

const MAX_BODY = 64 * 1024;

function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
}

export async function handleAlertRequest(req: Request, keyFromPath?: string): Promise<Response> {
  // Tracks the resolved key's prefix (never the plain key) so a failure after
  // auth can still be logged with a stable identifier; stays undefined for a
  // failure that happens before/while resolving the key.
  let prefix: string | undefined;

  try {
    const plain = keyFromPath?.trim() || bearer(req);
    const key = await resolveKey(plain);
    // Identical body for missing, unknown, and revoked: no oracle for key probing.
    if (!key) return Response.json({ error: 'invalid ingest key' }, { status: 401 });
    prefix = key.prefix;

    const gate = take(key.keyId);
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

    const result = await sendAlert(key.userId, parsed, 'api');
    // Log the key prefix only — never the full key or request path.
    console.log(`alert ${key.prefix} -> ${result.status}`);
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    // Net for anything unexpected (malformed body encoding, a DB blip inside
    // sendAlert, ...): never let an exception propagate into Next's default
    // error handling, which may log the request URL/route and leak the key
    // that travels in the path. Log only the prefix (if we have one by now)
    // and the error message — never the plain key, never req.url, never a
    // full stack that could embed the path.
    const message = err instanceof Error ? err.message : String(err);
    console.error(prefix ? `alert ${prefix} error: ${message}` : `alert error: ${message}`);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
