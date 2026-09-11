import { handleAlertRequest } from '@/lib/apiAlert';

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  return handleAlertRequest(req, key);
}
