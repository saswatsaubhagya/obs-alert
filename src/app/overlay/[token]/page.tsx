import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import OverlayClient from './OverlayClient';

export const dynamic = 'force-dynamic';

export default async function OverlayPage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const overlay = await prisma.overlay.findUnique({ where: { token } });
  if (!overlay) notFound();
  return <OverlayClient token={token} />;
}
