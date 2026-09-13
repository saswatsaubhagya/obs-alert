import Link from 'next/link';

/** The signed-in nav. Rendered by the dashboard layout, and by /docs (which
 *  sits outside that layout) whenever there is a session. */
export default function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        OBS Alert
      </Link>
      <a href="/dashboard">Alerts</a>
      <a href="/dashboard/settings">Settings</a>
      <a href="/docs">API docs</a>
    </nav>
  );
}
