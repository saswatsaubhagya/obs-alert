import prisma from '@/lib/db';
import { subscribe } from '@/lib/hub';

export const dynamic = 'force-dynamic'; // never cache or prerender a live stream

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const overlay = await prisma.overlay.findUnique({ where: { token } });
  if (!overlay) return Response.json({ error: 'unknown overlay' }, { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const push = (frame: string) => controller.enqueue(encoder.encode(frame));
      push(': connected\n\n');
      unsubscribe = subscribe(overlay.userId, push);
      // Keeps intermediary proxies from idling the connection out.
      ping = setInterval(() => {
        try {
          push(': ping\n\n');
        } catch {
          clearInterval(ping);
          unsubscribe();
        }
      }, 15_000);
    },
    cancel() {
      clearInterval(ping);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // nginx: do not buffer this response
    },
  });
}
