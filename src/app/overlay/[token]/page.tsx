import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { parseWidget } from '@/lib/eventTypes';
import OverlayClient from './OverlayClient';

export const dynamic = 'force-dynamic';

export default async function OverlayPage(ctx: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await ctx.params;
  const overlay = await prisma.overlay.findUnique({ where: { token } });
  if (!overlay) notFound();
  // `?w=` is wire input: anything unknown (or absent) falls back to "render
  // every widget", which is what the URL did before per-widget sources.
  const widget = parseWidget((await ctx.searchParams).w);
  return <OverlayClient token={token} widget={widget} />;
}
