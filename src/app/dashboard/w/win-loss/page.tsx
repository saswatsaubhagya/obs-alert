import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import { BUILT_IN, EVENT_TYPE_KEYS } from '@/lib/eventTypes';
import { effectiveConfig } from '@/lib/sendAlert';
import ResultEditor from './ResultEditor';

const RESULT_KEYS = EVENT_TYPE_KEYS.filter((key) => BUILT_IN[key].widget === 'result');

export default async function WinLossWidget() {
  const userId = await requireUserId();
  const overlay = await prisma.overlay.findFirst({ where: { userId } });
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const types = await Promise.all(
    RESULT_KEYS.map(async (key) => ({
      key,
      label: BUILT_IN[key].label,
      config: await effectiveConfig(userId, key),
    }))
  );
  return (
    <ResultEditor
      types={types}
      overlayToken={overlay?.token ?? null}
      overlayUrl={overlay ? `${base}/overlay/${overlay.token}?w=result` : null}
    />
  );
}
