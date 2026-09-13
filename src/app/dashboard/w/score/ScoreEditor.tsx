'use client';

import { useEffect, useRef, useState } from 'react';
import { SCORE_POSITIONS, type ScoreConfig, type ScorePosition } from '@/lib/scoreConfig';
import { adjustScoreAction, saveScoreConfigAction } from './actions';
import { ColorField, Field, Slider, Toggle } from '../../controls';
import CopyButton from '../../CopyButton';

export default function ScoreEditor({
  initial,
  overlayToken,
  overlayUrl,
}: {
  initial: { wins: number; losses: number; config: ScoreConfig };
  overlayToken: string | null;
  overlayUrl: string | null;
}) {
  const [draft, setDraft] = useState<ScoreConfig>(initial.config);
  const [score, setScore] = useState({ wins: initial.wins, losses: initial.losses });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [iframeReady, setIframeReady] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function patch(p: Partial<ScoreConfig>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  // Debounced 200ms, same as the other editors. The preview paints the live
  // score with the *unsaved* config, so the board on screen is what Save would
  // put on stream.
  useEffect(() => {
    const timer = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        { kind: 'preview-alert', alert: { widget: 'score', ...score, config: draft } },
        window.location.origin
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, score, iframeReady]);

  async function onSave() {
    setBusy(true);
    setStatus('saving…');
    const r = await saveScoreConfigAction(draft);
    setStatus(r.ok ? 'saved' : `not saved — ${r.error}`);
    setBusy(false);
  }

  async function nudge(target: 'win' | 'lose' | 'reset', delta: number) {
    setBusy(true);
    const r = await adjustScoreAction(target, target === 'reset' ? 0 : delta);
    if (r.ok) setScore({ wins: r.score.wins, losses: r.score.losses });
    else setStatus(`${r.status} — ${r.error}`);
    setBusy(false);
  }

  const counter = (label: string, target: 'win' | 'lose', value: number) => (
    <div className="dock-count">
      <span className="dock-count-label">{label}</span>
      <button type="button" className="dock-step" onClick={() => nudge(target, -1)} disabled={busy || value === 0}>
        −
      </button>
      <span className="dock-count-value">{value}</span>
      <button type="button" className="dock-step" onClick={() => nudge(target, 1)} disabled={busy}>
        +
      </button>
    </div>
  );

  return (
    <div className="editor">
      <header className="page-head">
        <div>
          <h1>Scoreboard</h1>
          <p className="muted">
            A running tally that stays on screen. Firing WIN or LOSE from the OBS control dock counts
            it automatically; the ± buttons here and on the dock correct a misfire.
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
          <h2>Score</h2>
          <div className="dock-score">
            {counter('Wins', 'win', score.wins)}
            {counter('Losses', 'lose', score.losses)}
            <button
              type="button"
              className="dock-reset"
              onClick={() => nudge('reset', 0)}
              disabled={busy || (score.wins === 0 && score.losses === 0)}
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
              <Toggle
                label="Show WIN / LOSS text"
                checked={draft.showLabels}
                onChange={(v) => patch({ showLabels: v })}
              />
              <Field label="Wins label">
                <input
                  value={draft.winLabel}
                  maxLength={24}
                  disabled={!draft.showLabels}
                  onChange={(e) => patch({ winLabel: e.target.value })}
                />
              </Field>
              <Field label="Losses label">
                <input
                  value={draft.lossLabel}
                  maxLength={24}
                  disabled={!draft.showLabels}
                  onChange={(e) => patch({ lossLabel: e.target.value })}
                />
              </Field>
              <Field label="Separator">
                <input
                  value={draft.separator}
                  maxLength={4}
                  onChange={(e) => patch({ separator: e.target.value })}
                />
              </Field>
              <Field label="Position">
                <select
                  value={draft.pos}
                  onChange={(e) => patch({ pos: e.target.value as ScorePosition })}
                >
                  {SCORE_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <ColorField label="Wins colour" value={draft.winColor} onChange={(v) => patch({ winColor: v })} />
              <ColorField label="Losses colour" value={draft.lossColor} onChange={(v) => patch({ lossColor: v })} />
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
                  src={`/overlay/${overlayToken}?w=score`}
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
