import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import Dock from './Dock';

// A bearer credential lives in this URL; keep it out of search indexes.
export const metadata = { title: 'Control dock — OBS Alert', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ControlDock(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const overlay = await prisma.overlay.findUnique({ where: { controlToken: token } });
  if (!overlay) notFound();
  return <Dock token={token} />;
}
