import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import { getSocialsConfig } from '@/lib/socialsConfig';
import SocialsEditor from './SocialsEditor';

export default async function SocialsWidget() {
  const userId = await requireUserId();
  const [overlay, config] = await Promise.all([
    prisma.overlay.findFirst({ where: { userId } }),
    getSocialsConfig(userId),
  ]);
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  return (
    <SocialsEditor
      initial={config}
      overlayToken={overlay?.token ?? null}
      overlayUrl={overlay ? `${base}/overlay/${overlay.token}?w=socials` : null}
    />
  );
}
