import { handleControlFire } from '@/lib/controlFire';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return handleControlFire(req, token);
}
