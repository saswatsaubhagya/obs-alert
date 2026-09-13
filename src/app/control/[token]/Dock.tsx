'use client';

import { useState, useSyncExternalStore } from 'react';
import { describeResult } from '../../dashboard/describeResult';

const OPPONENT_KEY = 'obsalert.dock.opponent';

// A tiny store rather than an effect: useSyncExternalStore is the SSR-safe way
// to read browser-only state, so the server snapshot (empty) and the first
// client render agree without a second render pass. Same pattern as
// dashboard/SidePanel.tsx's collapsed flag.
const listeners = new Set<() => void>();

function readOpponent() {
  try {
    return localStorage.getItem(OPPONENT_KEY) ?? '';
  } catch {
    return ''; // private mode / storage disabled — start empty
  }
}

function writeOpponent(v: string) {
  try {
    localStorage.setItem(OPPONENT_KEY, v);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The OBS custom browser dock. No nav, no session, no side panel: this page
 *  renders inside a ~300px OBS panel and on a phone, and its only credential
 *  is the token in its own URL. */
export default function Dock({ token }: { token: string }) {
  const opponent = useSyncExternalStore(subscribe, readOpponent, () => '');
  const [status, setStatus] = useState('');
  const [firing, setFiring] = useState('');

  function onOpponent(v: string) {
    writeOpponent(v);
  }

  async function fire(type: 'win' | 'lose') {
    setFiring(type);
    setStatus('firing…');
    try {
      const res = await fetch(`/api/control/${token}/fire`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opponent.trim() ? { type, opponent: opponent.trim() } : { type }),
      });
      setStatus(describeResult({ status: res.status, body: await res.json() }));
    } catch {
      // A dock left open through a laptop sleep or an app restart is the
      // normal case here, not an exceptional one.
      setStatus('could not reach the server — is it running?');
    } finally {
      setFiring('');
    }
  }

  return (
    <main className="dock">
      <div className="dock-buttons">
        <button
          type="button"
          className="dock-btn dock-win"
          onClick={() => fire('win')}
          disabled={firing !== ''}
        >
          WIN
        </button>
        <button
          type="button"
          className="dock-btn dock-lose"
          onClick={() => fire('lose')}
          disabled={firing !== ''}
        >
          LOSE
        </button>
      </div>

      <label className="dock-field">
        <span>Opponent (optional)</span>
        <input value={opponent} onChange={(e) => onOpponent(e.target.value)} placeholder="Team Red" />
      </label>

      <p className="dock-status">{status}</p>
    </main>
  );
}
