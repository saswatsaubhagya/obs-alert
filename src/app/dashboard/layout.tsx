import { requireUserId } from '@/auth';
import SidePanel from './SidePanel';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireUserId();
  return (
    <div className="shell">
      <SidePanel />
      <div className="shell-main">{children}</div>
    </div>
  );
}
