export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav style={{ display: 'flex', gap: 16, padding: 16, borderBottom: '1px solid #ddd' }}>
        <a href="/dashboard">Alerts</a>
        <a href="/dashboard/settings">Settings</a>
      </nav>
      {children}
    </>
  );
}
