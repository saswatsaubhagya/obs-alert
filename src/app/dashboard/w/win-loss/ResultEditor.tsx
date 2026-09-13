'use client';

import { useEffect, useRef, useState } from 'react';
import { PRESETS, type Preset, type Style } from '@/lib/eventTypes';
import type { AlertPayload } from '@/lib/render';
// Same rendering contract the live path uses, so the preview cannot drift.
import { clampDuration, renderTemplate, templateValues } from '@/lib/template';
import { saveConfigAction, testFireAction, type ConfigPatch } from '../../actions';
import { ColorField, Field, Slider, SoundField, Toggle } from '../../controls';
import CopyButton from '../../CopyButton';
import { describeResult } from '../../describeResult';

type ResultType = {
  key: string;
  label: string;
  config: {
    enabled: boolean;
    render: {
      template: string;
      titleTemplate: string | null;
      style: Style;
      durationMs: number;
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
  soundUrl: string;
  soundVolume: number;
};

function toDraft(t: ResultType): Draft {
  const r = t.config.render;
  return {
    enabled: t.config.enabled,
    template: r.template,
    titleTemplate: r.titleTemplate ?? '',
    style: { ...r.style },
    durationMs: r.durationMs,
    soundUrl: r.soundUrl ?? '',
    soundVolume: r.soundVolume,
  };
}

// Same sample values testFireAction sends (see SAMPLES in alertConfig.ts), so
// the preview shows the same lines a fired result does — including the
// message line, which a real win/lose fire always carries.
const SAMPLE_MESSAGE = 'this is a test alert';

function draftToPatch(d: Draft): ConfigPatch {
  return {
    enabled: d.enabled,
    template: d.template,
    titleTemplate: d.titleTemplate || null,
    style: d.style,
    durationMs: Number(d.durationMs),
    soundUrl: d.soundUrl || null,
    soundVolume: Number(d.soundVolume),
  };
}

export default function ResultEditor({
  types,
  overlayToken,
  overlayUrl,
}: {
  types: ResultType[];
  overlayToken: string | null;
  overlayUrl: string | null;
}) {
  const [selectedKey, setSelectedKey] = useState(types[0]?.key);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(types.map((t) => [t.key, toDraft(t)]))
  );
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});
  const [fireStatus, setFireStatus] = useState<Record<string, string>>({});
  const [iframeReady, setIframeReady] = useState(0);
  const [replay, setReplay] = useState(0);
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

  // Debounced 200ms, same as the alert editor: OverlayClient's preview lane
  // replaces rather than queues, but there is no reason to post on every key.
  useEffect(() => {
    if (!draft || !selected) return;
    const locale = selected.config.render.locale;
    const timer = setTimeout(() => {
      const forTemplate = templateValues({ opponent: 'Team Red', message: SAMPLE_MESSAGE });
      const alert: AlertPayload = {
        id: 'preview',
        eventType: selectedKey,
        widget: 'result',
        title: draft.titleTemplate ? renderTemplate(draft.titleTemplate, forTemplate, locale) : '',
        text: renderTemplate(draft.template, forTemplate, locale),
        message: SAMPLE_MESSAGE,
        style: draft.style,
        durationMs: clampDuration(draft.durationMs),
        imageUrl: null,
        soundUrl: draft.soundUrl || null,
        soundVolume: Number(draft.soundVolume),
      };
      const win = iframeRef.current?.contentWindow;
      if (win) win.postMessage({ kind: 'preview-alert', alert }, window.location.origin);
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, selected, selectedKey, iframeReady, replay]);

  async function onSave() {
    setSaveStatus((s) => ({ ...s, [selectedKey]: 'saving…' }));
    const r = await saveConfigAction(selectedKey, draftToPatch(draft));
    setSaveStatus((s) => ({ ...s, [selectedKey]: r.ok ? 'saved' : `not saved — ${r.error}` }));
  }

  async function onFire(key: string) {
    setFireStatus((s) => ({ ...s, [key]: 'firing…' }));
    const r = await testFireAction(key);
    setFireStatus((s) => ({ ...s, [key]: describeResult(r) }));
  }

  if (!selected || !draft) return null;

  return (
    <div className="editor">
      <header className="page-head">
        <div>
          <h1>Win / Loss</h1>
          <p className="muted">
            A full-screen result animation. Fire it from the buttons here, or post{' '}
            <code>{'{"type":"win"}'}</code> to the alerts API from your game or bot.
          </p>
        </div>
        <div className="head-actions">
          {types.map((t) => (
            <button key={t.key} type="button" onClick={() => onFire(t.key)}>
              Fire {t.label} ›
            </button>
          ))}
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
          <h2>Outcomes</h2>
          {types.map((t) => (
            <div key={t.key} className="side-item" data-selected={t.key === selectedKey}>
              <button type="button" onClick={() => setSelectedKey(t.key)}>
                {t.label}
              </button>
              <span className="side-dot" data-on={drafts[t.key]?.enabled ?? true} />
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
                onChange={async (v) => {
                  patchDraft({ enabled: v });
                  await saveConfigAction(selectedKey, { enabled: v });
                }}
              />
              <Field label="Headline">
                <input value={draft.template} onChange={(e) => patchDraft({ template: e.target.value })} />
              </Field>
              <Field label="Kicker">
                <input
                  value={draft.titleTemplate}
                  onChange={(e) => patchDraft({ titleTemplate: e.target.value })}
                />
              </Field>
              <Field label="Animation">
                <select
                  value={draft.style.preset}
                  onChange={(e) => patchStyle({ preset: e.target.value as Preset })}
                >
                  {PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <ColorField label="Accent" value={draft.style.accent} onChange={(v) => patchStyle({ accent: v })} />
              <ColorField label="Text colour" value={draft.style.fg} onChange={(v) => patchStyle({ fg: v })} />
              <Field label="Font">
                <input value={draft.style.font} onChange={(e) => patchStyle({ font: e.target.value })} />
              </Field>
              <Slider
                label="Headline size"
                min={40}
                max={220}
                value={draft.style.size}
                onChange={(v) => patchStyle({ size: v })}
                format={(v) => `${v}px`}
              />
              <Slider
                label="Duration"
                min={1000}
                max={15000}
                step={100}
                value={draft.durationMs}
                onChange={(v) => patchDraft({ durationMs: v })}
                format={(v) => `${(v / 1000).toFixed(1)}s`}
              />
              <SoundField
                label="Sound"
                value={draft.soundUrl}
                volume={draft.soundVolume}
                onChange={(v) => patchDraft({ soundUrl: v })}
              />
              <Slider
                label="Sound volume"
                min={0}
                max={100}
                value={draft.soundVolume}
                onChange={(v) => patchDraft({ soundVolume: v })}
                format={(v) => `${v}%`}
              />
            </div>
          </section>
        </div>

        <div className="col-preview">
          <section className="card">
            <div className="card-head">
              <h2>Preview</h2>
              <button type="button" onClick={() => setReplay((n) => n + 1)} disabled={!overlayToken}>
                Replay
              </button>
            </div>
            {overlayToken ? (
              <div className="preview-stage">
                <iframe
                  ref={iframeRef}
                  src={`/overlay/${overlayToken}`}
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
        <span className="status">{fireStatus[selectedKey]}</span>
        <span className="status">{saveStatus[selectedKey]}</span>
        <button type="button" className="btn-primary" onClick={onSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
