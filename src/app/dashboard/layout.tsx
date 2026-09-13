import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import SidePanel from './SidePanel';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  const overlay = await prisma.overlay.findFirst({ where: { userId } });
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  return (
    <div className="shell">
      <SidePanel overlayUrl={overlay ? `${base}/overlay/${overlay.token}` : null} />
      <div className="shell-main">{children}</div>
    </div>
  );
}
