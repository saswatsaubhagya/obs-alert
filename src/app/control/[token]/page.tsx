import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import Dock from './Dock';

// A bearer credential lives in this URL; keep it out of search indexes.
export const metadata = { title: 'Control dock — OBS Alert', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ControlDock(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let overlay;
  try {
    overlay = await prisma.overlay.findUnique({ where: { controlToken: token.trim() } });
  } catch (err) {
    // Never let an exception reach Next's default error handling: it may log
    // the request URL, and the URL carries the control token — same reasoning
    // as the catch in src/lib/controlFire.ts. Log the message only.
    const message = err instanceof Error ? err.message : String(err);
    console.error('control dock lookup failed: ' + message);
    notFound();
  }
  if (!overlay) notFound();
  return <Dock token={token} />;
}
