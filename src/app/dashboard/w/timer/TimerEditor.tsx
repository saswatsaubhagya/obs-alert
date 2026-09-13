'use client';

import { useEffect, useRef, useState } from 'react';
import {
  TIMER_FORMATS,
  TIMER_POSITIONS,
  formatClock,
  type TimerConfig,
  type TimerFormat,
  type TimerPosition,
} from '@/lib/timerConfig';
import { applyTimerAction, saveTimerConfigAction } from './actions';
import { ColorField, Field, Slider, Toggle } from '../../controls';
import CopyButton from '../../CopyButton';

const MIN = 60_000;
/** The nudges the buttons offer, in minutes. Anything else is a new Start. */
const NUDGES = [-5, -1, 1, 5];

export default function TimerEditor({
  initial,
  overlayToken,
  overlayUrl,
}: {
  initial: { running: boolean; remainingMs: number; config: TimerConfig };
  overlayToken: string | null;
  overlayUrl: string | null;
}) {
  const [draft, setDraft] = useState<TimerConfig>(initial.config);
  // Same shape the overlay keeps: what the server said, and when it said it.
  // The clock below ticks from `at`, so this page never needs the server's
  // wall clock to agree with the browser's.
  const [state, setState] = useState({
    running: initial.running,
    remainingMs: initial.remainingMs,
    // Stamped on mount, not during render: reading the clock while rendering
    // is neither pure nor SSR-safe.
    at: 0,
  });
  const [minutes, setMinutes] = useState(5);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // What the clock reads right now. Advanced by the interval below (never
  // during render) and set outright by the buttons, which already know the
  // answer the server just gave them.
  const [left, setLeft] = useState(initial.remainingMs);
  const [iframeReady, setIframeReady] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function patch(p: Partial<TimerConfig>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  // Only tick while something is actually moving. `origin` is the instant the
  // server's `remainingMs` was true: the button click that produced it, or —
  // for the state this page was rendered with — the moment this effect runs.
  useEffect(() => {
    if (!state.running) return;
    const origin = state.at > 0 ? state.at : Date.now();
    const id = setInterval(
      () => setLeft(Math.max(0, state.remainingMs - (Date.now() - origin))),
      250
    );
    return () => clearInterval(id);
  }, [state]);

  // Debounced 200ms, same as the other editors. The preview paints the live
  // clock with the *unsaved* config, so what is on screen is what Save would
  // put on stream. The iframe keeps ticking on its own between posts.
  useEffect(() => {
    const timer = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          kind: 'preview-alert',
          alert: {
            widget: 'timer',
            running: state.running,
            remainingMs:
              state.running && state.at > 0
                ? Math.max(0, state.remainingMs - (Date.now() - state.at))
                : state.remainingMs,
            config: draft,
          },
        },
        window.location.origin
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, state, iframeReady]);

  async function onSave() {
    setBusy(true);
    setStatus('saving…');
    const r = await saveTimerConfigAction(draft);
    setStatus(r.ok ? 'saved' : `not saved — ${r.error}`);
    setBusy(false);
  }

  async function run(action: 'start' | 'pause' | 'resume' | 'add' | 'reset', ms = 0) {
    setBusy(true);
    const r = await applyTimerAction(action, ms);
    if (r.ok) {
      setState({ ...r.timer, at: Date.now() });
      setLeft(r.timer.remainingMs);
      setStatus('');
    } else {
      setStatus(`${r.status} — ${r.error}`);
    }
    setBusy(false);
  }

  return (
    <div className="editor">
      <header className="page-head">
        <div>
          <h1>Timer</h1>
          <p className="muted">
            A countdown that stays on screen — a break, a &ldquo;starting soon&rdquo; clock, a
            giveaway window. Start it here or from the OBS control dock; the clock is held on the
            server, so every overlay and dock shows the same time left.
          </p>
        </div>
      </header>

      {overlayUrl ? (
        <div className="widget-url">
          <CopyButton className="url-copy" value={overlayUrl} label="Click To Copy Widget URL" />
          <a className="btn-primary btn-launch" href={overlayUrl} target="_blank" rel="noreferrer">
            Launch
          </a>
        </div>
      ) : null}

      <div className="editor-grid">
        <aside className="side">
          <h2>Clock</h2>
          <div className="dock-score">
            <div className="dock-count">
              <span className="dock-count-label">{state.running ? 'Running' : left > 0 ? 'Paused' : 'Stopped'}</span>
              <span className="dock-count-value">{formatClock(left, draft.format)}</span>
            </div>

            <Field label="Start at">
              <span className="field-control">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
                />
              </span>
            </Field>

            <div className="dock-buttons">
              <button type="button" className="btn-primary" onClick={() => run('start', minutes * MIN)} disabled={busy}>
                Start {minutes}m
              </button>
              {state.running ? (
                <button type="button" onClick={() => run('pause')} disabled={busy}>
                  Pause
                </button>
              ) : (
                <button type="button" onClick={() => run('resume')} disabled={busy || left === 0}>
                  Resume
                </button>
              )}
            </div>

            <div className="dock-buttons">
              {NUDGES.map((m) => (
                <button key={m} type="button" className="dock-step" onClick={() => run('add', m * MIN)} disabled={busy}>
                  {m > 0 ? `+${m}m` : `${m}m`}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="dock-reset"
              onClick={() => run('reset')}
              disabled={busy || (!state.running && left === 0)}
            >
              Reset
            </button>
          </div>
        </aside>

        <div className="col-main">
          <section className="card">
            <div className="card-head">
              <h2>Appearance</h2>
            </div>
            <div className="card-body">
              <Toggle label="Show label" checked={draft.showLabel} onChange={(v) => patch({ showLabel: v })} />
              <Field label="Label">
                <input
                  value={draft.label}
                  maxLength={24}
                  disabled={!draft.showLabel}
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </Field>
              <Field label="Format">
                <select value={draft.format} onChange={(e) => patch({ format: e.target.value as TimerFormat })}>
                  {TIMER_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'auto' ? 'auto (hours only when needed)' : f}
                    </option>
                  ))}
                </select>
              </Field>
              <Toggle
                label="Hide the widget at 00:00"
                checked={draft.hideAtZero}
                onChange={(v) => patch({ hideAtZero: v })}
              />
              <Field label="Text at 00:00">
                <input
                  value={draft.endText}
                  maxLength={24}
                  disabled={draft.hideAtZero}
                  placeholder="00:00"
                  onChange={(e) => patch({ endText: e.target.value })}
                />
              </Field>
              <Slider
                label="Warn under"
                min={0}
                max={600}
                step={5}
                value={draft.warnAtSec}
                onChange={(v) => patch({ warnAtSec: v })}
                format={(v) => (v === 0 ? 'off' : `${v}s`)}
              />
              <Field label="Position">
                <select value={draft.pos} onChange={(e) => patch({ pos: e.target.value as TimerPosition })}>
                  {TIMER_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <ColorField label="Digits colour" value={draft.color} onChange={(v) => patch({ color: v })} />
              <ColorField label="Warning colour" value={draft.warnColor} onChange={(v) => patch({ warnColor: v })} />
              <ColorField label="Label colour" value={draft.labelColor} onChange={(v) => patch({ labelColor: v })} />
              <ColorField label="Background" value={draft.bg} onChange={(v) => patch({ bg: v })} />
              <Field label="Font">
                <input value={draft.font} onChange={(e) => patch({ font: e.target.value })} />
              </Field>
              <Slider
                label="Size"
                min={16}
                max={200}
                value={draft.size}
                onChange={(v) => patch({ size: v })}
                format={(v) => `${v}px`}
              />
            </div>
          </section>
        </div>

        <div className="col-preview">
          <section className="card">
            <div className="card-head">
              <h2>Preview</h2>
            </div>
            {overlayToken ? (
              <div className="preview-stage">
                <iframe
                  ref={iframeRef}
                  src={`/overlay/${overlayToken}?w=timer`}
                  onLoad={() => setIframeReady((n) => n + 1)}
                  title="Overlay preview"
                />
              </div>
            ) : (
              <div className="card-body">
                <p className="muted note">
                  No overlay URL yet — set one up on the Settings page, then come back here to preview.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="savebar">
        <span className="status">{status}</span>
        <button type="button" className="btn-primary" onClick={onSave} disabled={busy}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
