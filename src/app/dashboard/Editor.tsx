'use client';

import { useEffect, useRef, useState } from 'react';
import type { Field, Style } from '@/lib/eventTypes';
import type { AlertPayload } from '@/lib/render';
import { manualSendAction, saveConfigAction, testFireAction, type ConfigPatch } from './actions';

type TypeConfig = {
  key: string;
  label: string;
  fields: Field[];
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

// Mirrors renderTemplate() in src/lib/render.ts. Duplicated rather than imported
// so this client component never drags src/lib/render.ts's `node:crypto` import
// (used only by renderAlert, for id generation) into the browser bundle.
function renderTemplatePreview(
  template: string,
  values: Record<string, string | number>,
  locale: string
): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = values[name];
    if (v === undefined) return '';
    if (typeof v !== 'number') return v;
    if (name === 'amount' && typeof values.currency === 'string') {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: values.currency }).format(v);
      } catch {
        return new Intl.NumberFormat(locale).format(v);
      }
    }
    return new Intl.NumberFormat(locale).format(v);
  });
}

const POSITIONS = ['top-left', 'top', 'top-right', 'center', 'bottom-left', 'bottom', 'bottom-right'];
const ANIMATIONS = ['fade', 'slide', 'pop'] as const;

function describeResult(r: { status: number; body: unknown }): string {
  if (r.status === 200) {
    const b = r.body as { delivered: number };
    return `200 — delivered to ${b.delivered} overlay connection(s)`;
  }
  if (r.status === 202) {
    const b = r.body as { skipped: string };
    return `202 — skipped: ${b.skipped}`;
  }
  const b = r.body as { error: string };
  return `400 — ${b.error}`;
}

export default function Editor({
  types,
  overlayToken,
  samples,
}: {
  types: TypeConfig[];
  overlayToken: string | null;
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

  const lastFocused = useRef<'template' | 'titleTemplate'>('template');
  const templateRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const selected = types.find((t) => t.key === selectedKey);
  const draft = drafts[selectedKey];

  function patchDraft(patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [selectedKey]: { ...d[selectedKey], ...patch } }));
  }
  function patchStyle(patch: Partial<Style>) {
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
    if (!draft) return;
    const timer = setTimeout(() => {
      const values = samples[selectedKey] ?? {};
      // Ruling 11: message never feeds text/title — it is not a template value.
      const { message: _message, ...templateValues } = values;
      const alert: AlertPayload = {
        id: 'preview',
        eventType: selectedKey,
        title: draft.titleTemplate ? renderTemplatePreview(draft.titleTemplate, templateValues, draft.locale) : '',
        text: renderTemplatePreview(draft.template, templateValues, draft.locale),
        message: typeof values.message === 'string' ? values.message : '',
        style: draft.style,
        durationMs: Math.min(30000, Math.max(100, Math.round(Number(draft.durationMs) || 0))),
        imageUrl: draft.imageUrl || null,
        soundUrl: draft.soundUrl || null,
        soundVolume: Number(draft.soundVolume),
      };
      const win = iframeRef.current?.contentWindow;
      if (win) win.postMessage({ kind: 'preview-alert', alert }, window.location.origin);
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, selectedKey, samples, iframeReady]);

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
    <main style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: 24, padding: '4vh 24px' }}>
      <aside style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        {types.map((t) => (
          <div
            key={t.key}
            style={{
              border: t.key === selectedKey ? '2px solid #7c5cff' : '1px solid #ccc',
              borderRadius: 8,
              padding: 8,
              display: 'grid',
              gap: 4,
            }}
          >
            <button type="button" onClick={() => setSelectedKey(t.key)} style={{ textAlign: 'left' }}>
              {t.label}
            </button>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={drafts[t.key]?.enabled ?? true}
                onChange={(e) => onToggleEnabled(t.key, e.target.checked)}
              />
              enabled
            </label>
          </div>
        ))}
      </aside>

      <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <h2>{selected.label}</h2>

        <div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Variables (click to insert into the focused field):</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chipFields.map((f) => (
              <button type="button" key={f.name} onClick={() => insertChip(f.name)}>
                {`{${f.name}}`}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            The donor&apos;s message is never a template variable — it always renders as its own line below the
            alert text, not something you can weave into the wording.
          </p>
        </div>

        <label>
          Template
          <input
            ref={templateRef}
            value={draft.template}
            onFocus={() => (lastFocused.current = 'template')}
            onChange={(e) => patchDraft({ template: e.target.value })}
            style={{ width: '100%' }}
          />
        </label>

        <label>
          Title template
          <input
            ref={titleRef}
            value={draft.titleTemplate}
            onFocus={() => (lastFocused.current = 'titleTemplate')}
            onChange={(e) => patchDraft({ titleTemplate: e.target.value })}
            style={{ width: '100%' }}
          />
        </label>

        <fieldset style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <legend>Style</legend>
          <label>
            Accent
            <input value={draft.style.accent} onChange={(e) => patchStyle({ accent: e.target.value })} />
          </label>
          <label>
            Background
            <input value={draft.style.bg} onChange={(e) => patchStyle({ bg: e.target.value })} />
          </label>
          <label>
            Text colour
            <input value={draft.style.fg} onChange={(e) => patchStyle({ fg: e.target.value })} />
          </label>
          <label>
            Font
            <input value={draft.style.font} onChange={(e) => patchStyle({ font: e.target.value })} />
          </label>
          <label>
            Size
            <input
              type="number"
              value={draft.style.size}
              onChange={(e) => patchStyle({ size: Number(e.target.value) })}
            />
          </label>
          <label>
            Position
            <select value={draft.style.pos} onChange={(e) => patchStyle({ pos: e.target.value })}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Width
            <input
              type="number"
              value={draft.style.width}
              onChange={(e) => patchStyle({ width: Number(e.target.value) })}
            />
          </label>
          <label>
            Corner radius
            <input
              type="number"
              value={draft.style.radius}
              onChange={(e) => patchStyle({ radius: Number(e.target.value) })}
            />
          </label>
          <label>
            Animation
            <select value={draft.style.anim} onChange={(e) => patchStyle({ anim: e.target.value as Style['anim'] })}>
              {ANIMATIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <label>
          Duration (ms)
          <input
            type="number"
            value={draft.durationMs}
            onChange={(e) => patchDraft({ durationMs: Number(e.target.value) })}
          />
        </label>
        <label>
          Image URL
          <input value={draft.imageUrl} onChange={(e) => patchDraft({ imageUrl: e.target.value })} />
        </label>
        <label>
          Sound URL
          <input value={draft.soundUrl} onChange={(e) => patchDraft({ soundUrl: e.target.value })} />
        </label>
        <label>
          Sound volume (0–100)
          <input
            type="number"
            min={0}
            max={100}
            value={draft.soundVolume}
            onChange={(e) => patchDraft({ soundVolume: Number(e.target.value) })}
          />
        </label>
        <label>
          Minimum amount
          <input type="number" value={draft.minAmount} onChange={(e) => patchDraft({ minAmount: e.target.value })} />
        </label>
        <label>
          Locale
          <input value={draft.locale} onChange={(e) => patchDraft({ locale: e.target.value })} />
        </label>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={onSave}>
            Save
          </button>
          <span style={{ fontSize: 13 }}>{saveStatus[selectedKey]}</span>
          <button type="button" onClick={() => onTestFire(selectedKey)}>
            Test fire
          </button>
          <span style={{ fontSize: 13 }}>{fireStatus[selectedKey]}</span>
        </div>

        <fieldset style={{ display: 'grid', gap: 8 }}>
          <legend>Manual send</legend>
          <form
            action={async (form: FormData) => {
              const r = await manualSendAction(form);
              setManualStatus(describeResult(r));
            }}
            style={{ display: 'grid', gap: 8 }}
          >
            <input type="hidden" name="type" value={selectedKey} />
            {selected.fields.map((f) => (
              <label key={f.name}>
                {f.name}
                {f.required ? ' (required)' : ''}
                <input name={f.name} type={f.type === 'number' ? 'number' : 'text'} required={f.required} />
              </label>
            ))}
            <button type="submit">Send</button>
          </form>
          {manualStatus && <span style={{ fontSize: 13 }}>{manualStatus}</span>}
        </fieldset>
      </section>

      <section>
        <h2>Preview</h2>
        {overlayToken ? (
          <div
            style={{
              aspectRatio: '16 / 9',
              width: '100%',
              background: 'repeating-conic-gradient(#222 0% 25%, #2c2c2c 0% 50%) 0 0 / 24px 24px',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <iframe
              ref={iframeRef}
              src={`/overlay/${overlayToken}`}
              onLoad={() => setIframeReady((n) => n + 1)}
              style={{ width: '100%', height: '100%', border: 0 }}
              title="Overlay preview"
            />
          </div>
        ) : (
          <p>No overlay URL yet — set one up on the Settings page, then come back here to preview alerts.</p>
        )}
      </section>
    </main>
  );
}
