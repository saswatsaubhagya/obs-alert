'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MAX_ACCOUNTS,
  PLATFORMS,
  PLATFORM_META,
  SOCIALS_ANIMS,
  SOCIALS_ORDERS,
  SOCIALS_POSITIONS,
  type Platform,
  type SocialsAnim,
  type SocialsConfig,
  type SocialsOrder,
  type SocialsPosition,
} from '@/lib/socialsConfig';
import { saveSocialsConfigAction } from './actions';
import { ColorField, Field, Slider, Toggle } from '../../controls';
import CopyButton from '../../CopyButton';

export default function SocialsEditor({
  initial,
  overlayToken,
  overlayUrl,
}: {
  initial: SocialsConfig;
  overlayToken: string | null;
  overlayUrl: string | null;
}) {
  const [draft, setDraft] = useState<SocialsConfig>(initial);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [iframeReady, setIframeReady] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function patch(p: Partial<SocialsConfig>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function patchAccount(i: number, p: { platform?: Platform; handle?: string }) {
    setDraft((d) => ({
      ...d,
      accounts: d.accounts.map((a, n) => (n === i ? { ...a, ...p } : a)),
    }));
  }

  function move(i: number, by: -1 | 1) {
    setDraft((d) => {
      const next = [...d.accounts];
      const to = i + by;
      if (to < 0 || to >= next.length) return d;
      [next[i], next[to]] = [next[to], next[i]];
      return { ...d, accounts: next };
    });
  }

  // Debounced 200ms, same as the other editors: the preview paints the
  // *unsaved* config, so what is on screen is what Save would put on stream.
  // Each post restarts the rotation in the iframe, which is what makes a
  // timing change visible without waiting out the current lap.
  useEffect(() => {
    const timer = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        { kind: 'preview-alert', alert: { widget: 'socials', config: draft } },
        window.location.origin
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, iframeReady]);

  async function onSave() {
    setBusy(true);
    setStatus('saving…');
    const r = await saveSocialsConfigAction(draft);
    setStatus(r.ok ? 'saved' : `not saved — ${r.error}`);
    setBusy(false);
  }

  const full = draft.accounts.length >= MAX_ACCOUNTS;

  return (
    <div className="editor">
      <header className="page-head">
        <div>
          <h1>Socials</h1>
          <p className="muted">
            Your other accounts, one at a time, on a loop — shown for a few seconds, then away
            again until the next one comes round. Add as many as you like; the rotation runs in
            the overlay itself, so it keeps going whether or not the dashboard is open.
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
          <h2>Accounts</h2>
          <div className="social-rows">
            {draft.accounts.map((a, i) => (
              <div className="social-row" key={i}>
                <select
                  value={a.platform}
                  aria-label="Network"
                  onChange={(e) => patchAccount(i, { platform: e.target.value as Platform })}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_META[p].label}
                    </option>
                  ))}
                </select>
                <input
                  value={a.handle}
                  maxLength={40}
                  placeholder="@handle"
                  aria-label="Handle"
                  onChange={(e) => patchAccount(i, { handle: e.target.value })}
                />
                <div className="social-row-buttons">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.accounts.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ accounts: draft.accounts.filter((_, n) => n !== i) })}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {draft.accounts.length === 0 ? (
              <p className="muted note">No accounts yet — add one and it appears in the preview.</p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={full}
            onClick={() => patch({ accounts: [...draft.accounts, { platform: 'twitch', handle: '' }] })}
          >
            {full ? `Limit is ${MAX_ACCOUNTS}` : 'Add account'}
          </button>
        </aside>

        <div className="col-main">
          <section className="card">
            <div className="card-head">
              <h2>Rotation</h2>
            </div>
            <div className="card-body">
              <Slider
                label="On screen for"
                min={1}
                max={120}
                value={draft.showSec}
                onChange={(v) => patch({ showSec: v })}
                format={(v) => `${v}s`}
              />
              <Slider
                label="Then hidden for"
                min={0}
                max={300}
                step={5}
                value={draft.gapSec}
                onChange={(v) => patch({ gapSec: v })}
                format={(v) => (v === 0 ? 'never hidden' : `${v}s`)}
              />
              <Field label="Order">
                <select
                  value={draft.order}
                  onChange={(e) => patch({ order: e.target.value as SocialsOrder })}
                >
                  {SOCIALS_ORDERS.map((o) => (
                    <option key={o} value={o}>
                      {o === 'list' ? 'in order' : 'random'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Animation">
                <select
                  value={draft.anim}
                  onChange={(e) => patch({ anim: e.target.value as SocialsAnim })}
                >
                  {SOCIALS_ANIMS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Appearance</h2>
            </div>
            <div className="card-body">
              <Toggle label="Show icon" checked={draft.showIcon} onChange={(v) => patch({ showIcon: v })} />
              <Toggle
                label="Icon in the network's colour"
                checked={draft.useBrandColor}
                onChange={(v) => patch({ useBrandColor: v })}
              />
              <Toggle
                label="Show network name"
                checked={draft.showLabel}
                onChange={(v) => patch({ showLabel: v })}
              />
              <Field label="Position">
                <select
                  value={draft.pos}
                  onChange={(e) => patch({ pos: e.target.value as SocialsPosition })}
                >
                  {SOCIALS_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <ColorField label="Handle colour" value={draft.color} onChange={(v) => patch({ color: v })} />
              <ColorField
                label="Network name colour"
                value={draft.labelColor}
                onChange={(v) => patch({ labelColor: v })}
              />
              <ColorField label="Background" value={draft.bg} onChange={(v) => patch({ bg: v })} />
              <Field label="Font">
                <input value={draft.font} onChange={(e) => patch({ font: e.target.value })} />
              </Field>
              <Slider
                label="Size"
                min={12}
                max={160}
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
                  src={`/overlay/${overlayToken}?w=socials`}
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
