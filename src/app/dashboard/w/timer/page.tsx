import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import { getTimer } from '@/lib/timer';
import TimerEditor from './TimerEditor';

export default async function TimerWidget() {
  const userId = await requireUserId();
  const [overlay, state] = await Promise.all([
    prisma.overlay.findFirst({ where: { userId } }),
    getTimer(userId),
  ]);
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  return (
    <TimerEditor
      initial={state}
      overlayToken={overlay?.token ?? null}
      overlayUrl={overlay ? `${base}/overlay/${overlay.token}?w=timer` : null}
    />
  );
}
