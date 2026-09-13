// The shared front half of every /api/control/{token}/* handler. One copy, so
// the token check and the rate limit cannot drift apart between endpoints.
import prisma from './db';
import { take } from './ratelimit';

export type ControlOverlay = { id: string; userId: string };

/** Resolves the dock's write credential and rate-limits per overlay. Returns
 *  the overlay, or the Response the caller should return unchanged. Missing
 *  and unknown tokens get an identical body: no oracle for token probing. */
export async function authorizeControl(token: string): Promise<ControlOverlay | Response> {
  const overlay = token.trim()
    ? await prisma.overlay.findUnique({
        where: { controlToken: token.trim() },
        select: { id: true, userId: true },
      })
    : null;
  if (!overlay) return Response.json({ error: 'invalid control token' }, { status: 401 });

  const gate = take(`control:${overlay.id}`);
  if (!gate.ok) {
    return Response.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfter) } }
    );
  }
  return overlay;
}
