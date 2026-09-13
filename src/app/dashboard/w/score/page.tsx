import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import { getScore } from '@/lib/score';
import ScoreEditor from './ScoreEditor';

export default async function ScoreWidget() {
  const userId = await requireUserId();
  const [overlay, state] = await Promise.all([
    prisma.overlay.findFirst({ where: { userId } }),
    getScore(userId),
  ]);
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  return (
    <ScoreEditor
      initial={state}
      overlayToken={overlay?.token ?? null}
      overlayUrl={overlay ? `${base}/overlay/${overlay.token}?w=score` : null}
    />
  );
}
