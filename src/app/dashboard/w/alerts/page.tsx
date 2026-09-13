import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import { sampleValues } from '@/lib/alertConfig';
import { BUILT_IN, EVENT_TYPE_KEYS } from '@/lib/eventTypes';
import { effectiveConfig } from '@/lib/sendAlert';
import Editor from '../../Editor';

const ALERT_KEYS = EVENT_TYPE_KEYS.filter((key) => BUILT_IN[key].widget === 'alerts');

export default async function AlertsWidget() {
  const userId = await requireUserId();
  const overlay = await prisma.overlay.findFirst({ where: { userId } });
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const types = await Promise.all(
    ALERT_KEYS.map(async (key) => ({
      key,
      label: BUILT_IN[key].label,
      fields: BUILT_IN[key].fields,
      config: await effectiveConfig(userId, key),
    }))
  );
  const samples = Object.fromEntries(ALERT_KEYS.map((key) => [key, sampleValues(key)]));
  // A user without an overlay row (should not happen post-signup, but the
  // schema does not guarantee it) gets an explicit empty state from Editor
  // rather than a broken `/overlay/undefined` preview URL.
  return (
    <Editor
      types={types}
      overlayToken={overlay?.token ?? null}
      overlayUrl={overlay ? `${base}/overlay/${overlay.token}` : null}
      samples={samples}
    />
  );
}
