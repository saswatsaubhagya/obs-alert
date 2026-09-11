export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <a href="/" className="brand">
          OBS Alert
        </a>
        <a href="/dashboard">Alerts</a>
        <a href="/dashboard/settings">Settings</a>
      </nav>
      {children}
    </>
  );
}
