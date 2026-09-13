import { handleControlScore } from '@/lib/controlScore';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleControlScore(req, token);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleControlScore(req, token);
}
