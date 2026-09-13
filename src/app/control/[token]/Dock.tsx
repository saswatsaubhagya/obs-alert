'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { describeResult } from '../../dashboard/describeResult';
import { resolveOpponent } from './resolveOpponent';

const OPPONENT_KEY = 'obsalert.dock.opponent';

// useSyncExternalStore (not an effect) supplies only the *initial* snapshot:
// SSR-safe, so the server snapshot (empty) and the first client render agree
// without a second render pass — same idea as dashboard/SidePanel.tsx's
// collapsed flag. But unlike that flag, this store is not the source of
// truth for what's on screen after mount: once the user types, `draft`
// (below) takes over, so a `localStorage.setItem` throw (private mode,
// quota, storage disabled) never makes the field snap back to a stale value.
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
    /* best effort — the typed value already lives in `draft` regardless */
  }
}

/** The OBS custom browser dock. No nav, no session, no side panel: this page
 *  renders inside a ~300px OBS panel and on a phone, and its only credential
 *  is the token in its own URL. */
export default function Dock({ token }: { token: string }) {
  const stored = useSyncExternalStore(
    () => () => {},
    readOpponent,
    () => ''
  );
  const [draft, setDraft] = useState<string | null>(null);
  const opponent = resolveOpponent(draft, stored);
  const [status, setStatus] = useState('');
  const [firing, setFiring] = useState('');
  const [score, setScore] = useState<{ wins: number; losses: number } | null>(null);

  // The dock is the thing people click, so it shows the same tally the
  // scoreboard widget shows. Server-owned: every response carries the new
  // score, so the two cannot drift.
  useEffect(() => {
    let live = true;
    fetch(`/api/control/${token}/score`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (live && s) setScore(s);
      })
      .catch(() => {}); // an unreachable server already shows up on the next click
    return () => {
      live = false;
    };
  }, [token]);

  function onOpponent(v: string) {
    setDraft(v); // what the user sees — never depends on storage succeeding
    writeOpponent(v); // best effort; a throw is already swallowed inside
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
      const body = await res.json();
      if (body?.score) setScore(body.score);
      setStatus(describeResult({ status: res.status, body }));
    } catch {
      // A dock left open through a laptop sleep or an app restart is the
      // normal case here, not an exceptional one.
      setStatus('could not reach the server — is it running?');
    } finally {
      setFiring('');
    }
  }

  /** ± and reset. Same shape as fire(): the server returns the new score, the
   *  dock never computes one locally. */
  async function nudge(type: 'win' | 'lose' | 'reset', delta: number) {
    setFiring(`${type}${delta}`);
    setStatus('');
    try {
      const res = await fetch(`/api/control/${token}/score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(type === 'reset' ? { type } : { type, delta }),
      });
      const body = await res.json();
      if (res.ok) setScore(body);
      else setStatus(describeResult({ status: res.status, body }));
    } catch {
      setStatus('could not reach the server — is it running?');
    } finally {
      setFiring('');
    }
  }

  const counter = (label: string, type: 'win' | 'lose', value: number, cls: string) => (
    <div className={`dock-count ${cls}`}>
      <span className="dock-count-label">{label}</span>
      <button
        type="button"
        className="dock-step"
        onClick={() => nudge(type, -1)}
        disabled={firing !== '' || value === 0}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className="dock-count-value">{value}</span>
      <button
        type="button"
        className="dock-step"
        onClick={() => nudge(type, 1)}
        disabled={firing !== ''}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );

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

      {score ? (
        <div className="dock-score">
          {counter('Wins', 'win', score.wins, 'dock-win')}
          {counter('Losses', 'lose', score.losses, 'dock-lose')}
          <button
            type="button"
            className="dock-reset"
            onClick={() => nudge('reset', 0)}
            disabled={firing !== '' || (score.wins === 0 && score.losses === 0)}
          >
            Reset
          </button>
        </div>
      ) : null}

      <label className="dock-field">
        <span>Opponent (optional)</span>
        <input value={opponent} onChange={(e) => onOpponent(e.target.value)} placeholder="Team Red" />
      </label>

      <p className="dock-status">{status}</p>
    </main>
  );
}
