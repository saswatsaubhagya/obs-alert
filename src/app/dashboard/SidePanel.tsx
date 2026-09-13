'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOutAction } from './actions';
import CopyButton from './CopyButton';

/** The signed-in chrome. Rendered by the dashboard layout, and by /docs (which
 *  sits outside that layout) whenever there is a session. Replaces Nav.tsx. */

// One entry per widget. Adding a widget means adding a line here and a route
// under /dashboard/w/.
const WIDGETS = [
  { href: '/dashboard/w/alerts', label: 'Alerts', icon: '◎' },
  { href: '/dashboard/w/win-loss', label: 'Win / Loss', icon: '★' },
];

const LINKS = [
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
  { href: '/docs', label: 'API docs', icon: '⌘' },
];

const KEY = 'obsalert.sidebar.collapsed';

export default function SidePanel({ overlayUrl }: { overlayUrl: string | null }) {
  const pathname = usePathname();
  // Read in an effect, not in the initializer: the server renders expanded, so
  // reading localStorage during the first client render would be a hydration
  // mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // Intentional: this is the one-time post-hydration read described above,
      // not an external-store subscription — there is nothing to subscribe to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(KEY) === '1');
    } catch {
      /* private mode / storage disabled — stay expanded */
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  const item = (l: { href: string; label: string; icon: string }) => (
    <Link
      key={l.href}
      href={l.href}
      className="sidebar-item"
      data-active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
      title={l.label}
    >
      <span className="sidebar-icon" aria-hidden>
        {l.icon}
      </span>
      <span className="sidebar-label">{l.label}</span>
    </Link>
  );

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar-top">
        <Link href="/" className="brand" title="OBS Alert">
          <span className="sidebar-label">OBS Alert</span>
        </Link>
        <button type="button" className="sidebar-toggle" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="sidebar-group">
        <h2 className="sidebar-heading">Widgets</h2>
        {WIDGETS.map(item)}
      </nav>

      <div className="sidebar-foot">
        {overlayUrl && !collapsed ? (
          <CopyButton className="sidebar-copy" value={overlayUrl} label="Copy overlay URL" />
        ) : null}
        {LINKS.map(item)}
        <form action={signOutAction}>
          <button type="submit" className="sidebar-item" title="Sign out">
            <span className="sidebar-icon" aria-hidden>
              ⏻
            </span>
            <span className="sidebar-label">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
