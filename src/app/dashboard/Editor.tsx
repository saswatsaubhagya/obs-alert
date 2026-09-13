'use client';

import { useEffect, useRef, useState } from 'react';
import type { Field as FieldSpec, Style } from '@/lib/eventTypes';
import type { AlertPayload } from '@/lib/render';
// The one copy of the rendering contract, shared with src/lib/render.ts so the
// preview cannot drift from what actually streams. (src/lib/template.ts is
// `node:crypto`-free precisely so this client component can import it.)
import { clampDuration, renderTemplate, templateValues } from '@/lib/template';
import { manualSendAction, saveConfigAction, testFireAction, type ConfigPatch } from './actions';
import { ColorField, Field, Slider, SoundField, Toggle } from './controls';
import CopyButton from './CopyButton';
import { describeResult } from './describeResult';

type TypeConfig = {
  key: string;
  label: string;
  fields: FieldSpec[];
  config: {
    enabled: boolean;
    minAmount: number | null;
    render: {
      template: string;
      titleTemplate: string | null;
      style: Style;
      durationMs: number;
      imageUrl: string | null;
      soundUrl: string | null;
      soundVolume: number;
      locale: string;
    };
  };
};

type Draft = {
  enabled: boolean;
  template: string;
  titleTemplate: string;
  style: Style;
  durationMs: number;
  imageUrl: string;
  soundUrl: string;
  soundVolume: number;
  minAmount: string; // kept as a string for a controlled input; parsed on save
  locale: string;
};

function toDraft(t: TypeConfig): Draft {
  const r = t.config.render;
  return {
    enabled: t.config.enabled,
    template: r.template,
    titleTemplate: r.titleTemplate ?? '',
    style: { ...r.style },
    durationMs: r.durationMs,
    imageUrl: r.imageUrl ?? '',
    soundUrl: r.soundUrl ?? '',
    soundVolume: r.soundVolume,
    minAmount: t.config.minAmount === null ? '' : String(t.config.minAmount),
    locale: r.locale,
  };
}

function draftToPatch(d: Draft): ConfigPatch {
  return {
    enabled: d.enabled,
    template: d.template,
    titleTemplate: d.titleTemplate || null,
    style: d.style,
    durationMs: Number(d.durationMs),
    imageUrl: d.imageUrl || null,
    soundUrl: d.soundUrl || null,
    soundVolume: Number(d.soundVolume),
    minAmount: d.minAmount === '' ? null : Number(d.minAmount),
    locale: d.locale,
  };
}

const POSITIONS = ['top-left', 'top', 'top-right', 'center', 'bottom-left', 'bottom', 'bottom-right'];
const ANIMATIONS = ['fade', 'slide', 'pop'] as const;
// ponytail: fixed short list; swap for Intl.supportedValuesOf('currency') if someone needs all 150+.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'BRL', 'MXN'];

export default function Editor({
  types,
  overlayToken,
  overlayUrl,
  samples,
}: {
  types: TypeConfig[];
  overlayToken: string | null;
  overlayUrl: string | null;
  samples: Record<string, Record<string, string | number>>;
}) {
  const [selectedKey, setSelectedKey] = useState(types[0]?.key);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(types.map((t) => [t.key, toDraft(t)]))
  );
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});
  const [fireStatus, setFireStatus] = useState<Record<string, string>>({});
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(0);
  const [replay, setReplay] = useState(0);
  const [stageBg, setStageBg] = useState('');

  const lastFocused = useRef<'template' | 'titleTemplate'>('template');
  const templateRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // ponytail: the preview only plays once the user asks for it — an edit or
  // Replay. Without this the page fired an alert on load, which read as the
  // overlay going off by itself.
  const armed = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selected = types.find((t) => t.key === selectedKey);
  const draft = drafts[selectedKey];

  function patchDraft(patch: Partial<Draft>) {
    armed.current = true;
    setDrafts((d) => ({ ...d, [selectedKey]: { ...d[selectedKey], ...patch } }));
  }
  function patchStyle(patch: Partial<Style>) {
    armed.current = true;
    setDrafts((d) => ({
      ...d,
      [selectedKey]: { ...d[selectedKey], style: { ...d[selectedKey].style, ...patch } },
    }));
  }

  // Live preview: on every edit (and once the iframe finishes loading), post the
  // locally-rendered alert to the real overlay route running same-origin in the
  // iframe — the overlay's existing `message` listener (Task 10) plays it as if
  // it arrived over SSE, so the preview cannot drift from what actually streams.
  //
  // Debounced 200ms after the last edit: without this, every keystroke posted
  // its own preview-alert, and OverlayClient's serial queue would play each one
  // out in full (donation's default durationMs is 6000ms), so a 30-character
  // edit queued minutes of stale previews cycling long after typing stopped.
  // The 200ms delay collapses a burst of edits into a single post; the
  // OverlayClient-side fix (a dedicated preview lane that replaces rather than
  // queues) is what actually makes a *single* post safe to redisplay quickly —
  // this debounce only cuts down how often that replace happens.
  useEffect(() => {
    if (!draft || !armed.current) return;
    const timer = setTimeout(() => {
      const values = samples[selectedKey] ?? {};
      // Ruling 11: message never feeds text/title — it is not a template value.
      const forTemplate = templateValues(values);
      const alert: AlertPayload = {
        id: 'preview',
        eventType: selectedKey,
        widget: 'alerts',
        title: draft.titleTemplate ? renderTemplate(draft.titleTemplate, forTemplate, draft.locale) : '',
        text: renderTemplate(draft.template, forTemplate, draft.locale),
        message: typeof values.message === 'string' ? values.message : '',
        style: draft.style,
        durationMs: clampDuration(draft.durationMs),
        imageUrl: draft.imageUrl || null,
        soundUrl: draft.soundUrl || null,
        soundVolume: Number(draft.soundVolume),
      };
      const win = iframeRef.current?.contentWindow;
      if (win) win.postMessage({ kind: 'preview-alert', alert }, window.location.origin);
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, selectedKey, samples, iframeReady, replay]);

  function insertChip(name: string) {
    const target = lastFocused.current;
    patchDraft({ [target]: (draft[target] ?? '') + `{${name}}` } as Partial<Draft>);
    (target === 'template' ? templateRef : titleRef).current?.focus();
  }

  async function onSave() {
    setSaveStatus((s) => ({ ...s, [selectedKey]: 'saving…' }));
    const r = await saveConfigAction(selectedKey, draftToPatch(draft));
    setSaveStatus((s) => ({ ...s, [selectedKey]: r.ok ? 'saved' : `not saved — ${r.error}` }));
  }

  async function onToggleEnabled(key: string, enabled: boolean) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], enabled } }));
    await saveConfigAction(key, { enabled });
  }

  async function onTestFire(key: string) {
    setFireStatus((s) => ({ ...s, [key]: 'firing…' }));
    const r = await testFireAction(key);
    setFireStatus((s) => ({ ...s, [key]: describeResult(r) }));
  }

  if (!selected || !draft) return null;

  const chipFields = selected.fields.filter((f) => f.name !== 'message'); // Ruling 11

  return (
    <div className="editor">
      <header className="page-head">
        <div>
          <h1>Alert Box</h1>
          <p className="muted">
            Custom on-screen alerts to thank your viewers for following, subbing, tipping and more.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" onClick={() => onTestFire(selectedKey)}>
            Test {selected.label} ›
          </button>
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
          <h2>Alert types</h2>
          {types.map((t) => (
            <div key={t.key} className="side-item" data-selected={t.key === selectedKey}>
              <button type="button" onClick={() => setSelectedKey(t.key)}>
                {t.label}
              </button>
              <span
                className="side-dot"
                data-on={drafts[t.key]?.enabled ?? true}
                title={drafts[t.key]?.enabled ? 'enabled' : 'disabled'}
              />
            </div>
          ))}
        </aside>

        <div className="col-main">
          <section className="card">
            <div className="card-head">
              <h2>{selected.label}</h2>
            </div>
            <div className="card-body">
              <Toggle
                label="Enabled"
                checked={draft.enabled}
                onChange={(v) => onToggleEnabled(selectedKey, v)}
              />
              <Field label="Message template">
                <input
                  ref={templateRef}
                  value={draft.template}
                  onFocus={() => (lastFocused.current = 'template')}
                  onChange={(e) => patchDraft({ template: e.target.value })}
                />
              </Field>
              <Field label="Title template">
                <input
                  ref={titleRef}
                  value={draft.titleTemplate}
                  onFocus={() => (lastFocused.current = 'titleTemplate')}
                  onChange={(e) => patchDraft({ titleTemplate: e.target.value })}
                />
              </Field>
              <div className="chip-row">
                {chipFields.map((f) => (
                  <button type="button" className="chip" key={f.name} onClick={() => insertChip(f.name)}>
                    {`{${f.name}}`}
                  </button>
                ))}
              </div>
              <p className="muted note">
                Click a variable to insert it into the field you last edited. The donor&apos;s message is never
                a template variable — it always renders as its own line below the alert text, not something you
                can weave into the wording.
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Style</h2>
            </div>
            <div className="card-body">
              <ColorField label="Accent" value={draft.style.accent} onChange={(v) => patchStyle({ accent: v })} />
              <ColorField label="Background" value={draft.style.bg} onChange={(v) => patchStyle({ bg: v })} />
              <ColorField label="Text colour" value={draft.style.fg} onChange={(v) => patchStyle({ fg: v })} />
              <Field label="Font">
                <input value={draft.style.font} onChange={(e) => patchStyle({ font: e.target.value })} />
              </Field>
              <Slider
                label="Font size"
                min={10}
                max={96}
                value={draft.style.size}
                onChange={(v) => patchStyle({ size: v })}
                format={(v) => `${v}px`}
              />
              <Slider
                label="Width"
                min={200}
                max={1920}
                step={10}
                value={draft.style.width}
                onChange={(v) => patchStyle({ width: v })}
                format={(v) => `${v}px`}
              />
              <Slider
                label="Corner radius"
                min={0}
                max={64}
                value={draft.style.radius}
                onChange={(v) => patchStyle({ radius: v })}
                format={(v) => `${v}px`}
              />
              <Field label="Position">
                <select value={draft.style.pos} onChange={(e) => patchStyle({ pos: e.target.value })}>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Animation">
                <select
                  value={draft.style.anim}
                  onChange={(e) => patchStyle({ anim: e.target.value as Style['anim'] })}
                >
                  {ANIMATIONS.map((a) => (
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
              <h2>Playback</h2>
            </div>
            <div className="card-body">
              <Slider
                label="Alert duration"
                min={100}
                max={30000}
                step={100}
                value={draft.durationMs}
                onChange={(v) => patchDraft({ durationMs: v })}
                format={(v) => `${(v / 1000).toFixed(1)}s`}
              />
              <Slider
                label="Sound volume"
                min={0}
                max={100}
                value={draft.soundVolume}
                onChange={(v) => patchDraft({ soundVolume: v })}
                format={(v) => `${v}%`}
              />
              <Field label="Image URL">
                <input
                  value={draft.imageUrl}
                  placeholder="https://…"
                  onChange={(e) => patchDraft({ imageUrl: e.target.value })}
                />
              </Field>
              <SoundField
                label="Sound"
                value={draft.soundUrl}
                volume={draft.soundVolume}
                onChange={(v) => patchDraft({ soundUrl: v })}
              />
              <Field label="Minimum amount">
                <input
                  type="number"
                  value={draft.minAmount}
                  placeholder="no minimum"
                  onChange={(e) => patchDraft({ minAmount: e.target.value })}
                />
              </Field>
              <Field label="Locale">
                <input value={draft.locale} onChange={(e) => patchDraft({ locale: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Manual send</h2>
            </div>
            <div className="card-body">
              <form
                action={async (form: FormData) => {
                  const r = await manualSendAction(form);
                  setManualStatus(describeResult(r));
                }}
              >
                <input type="hidden" name="type" value={selectedKey} />
                {selected.fields.map((f) => (
                  <Field key={f.name} label={f.name + (f.required ? ' (required)' : '')}>
                    {f.name === 'currency' ? (
                      <select name={f.name} defaultValue="USD" required={f.required}>
                        {!f.required && <option value="">none</option>}
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input name={f.name} type={f.type === 'number' ? 'number' : 'text'} required={f.required} />
                    )}
                  </Field>
                ))}
                <div className="preview-foot" style={{ padding: '14px 0 4px' }}>
                  <button type="submit">Send</button>
                  {manualStatus && <span className="status">{manualStatus}</span>}
                </div>
              </form>
            </div>
          </section>
        </div>

        <div className="col-preview">
          <section className="card">
            <div className="card-head">
              <h2>Preview</h2>
              <button type="button" onClick={() => {
                  armed.current = true;
                  setReplay((n) => n + 1);
                }} disabled={!overlayToken}>
                Replay
              </button>
            </div>
            {overlayToken ? (
              <>
                <div className="preview-stage" style={stageBg ? { background: stageBg } : undefined}>
                  <iframe
                    ref={iframeRef}
                    src={`/overlay/${overlayToken}?w=alerts`}
                    onLoad={() => setIframeReady((n) => n + 1)}
                    title="Overlay preview"
                  />
                </div>
                <div className="preview-foot">
                  <span className="muted">Stage background</span>
                  <input
                    type="color"
                    className="swatch"
                    aria-label="Preview stage background"
                    value={stageBg || '#000000'}
                    onChange={(e) => setStageBg(e.target.value)}
                  />
                  <button type="button" onClick={() => setStageBg('')} disabled={!stageBg}>
                    Checkerboard
                  </button>
                </div>
              </>
            ) : (
              <div className="card-body">
                <p className="muted note">
                  No overlay URL yet — set one up on the Settings page, then come back here to preview alerts.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="savebar">
        <span className="status">{fireStatus[selectedKey]}</span>
        <span className="status">{saveStatus[selectedKey]}</span>
        <button type="button" className="btn-primary" onClick={onSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
