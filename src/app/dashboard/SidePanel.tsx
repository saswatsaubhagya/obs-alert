'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { WIDGETS } from '@/lib/eventTypes';
import { signOutAction } from './actions';

/** The signed-in chrome. Rendered by the dashboard layout, and by /docs (which
 *  sits outside that layout) whenever there is a session. Replaces Nav.tsx. */

const ICONS: Record<string, string> = { alerts: '◎', result: '★', score: '#', timer: '⏱', socials: '@' };

const LINKS = [
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
  { href: '/docs', label: 'API docs', icon: '⌘' },
];

const KEY = 'obsalert.sidebar.collapsed';

// A tiny store rather than an effect: useSyncExternalStore is the SSR-safe way
// to read browser-only state, so the server snapshot (expanded) and the first
// client render agree without a second render pass.
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // private mode / storage disabled — stay expanded
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export default function SidePanel() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  function toggle() {
    writeCollapsed(!collapsed);
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
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <nav className="sidebar-group">
        <h2 className="sidebar-heading">Widgets</h2>
        {WIDGETS.map((w) => item({ href: w.href, label: w.label, icon: ICONS[w.id] ?? '◎' }))}
      </nav>

      <div className="sidebar-foot">
        {LINKS.map(item)}
        <form action={signOutAction}>
          <button className="sidebar-item" title="Sign out">
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
