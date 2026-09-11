'use client';

import { useState } from 'react';
import { BUILT_IN_SOUNDS, isBuiltInSound } from '@/lib/sounds';

/** The three form controls the editor repeats: a switch, a slider with a value
 *  readout, and a colour text field with a native swatch beside it. Each one
 *  renders the same label-left / control-right row (`.field`) so every setting
 *  in the editor lines up on one column. */

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" />
      </span>
    </label>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="slider-value">{format(value)}</span>
      </span>
    </label>
  );
}

/** Hex colours get a swatch; anything else (the default `bg` is
 *  `rgba(12,12,16,0.86)`) keeps working through the text field, which stays the
 *  source of truth — a native colour input cannot hold an alpha channel.
 *  ponytail: swatch writes hex, text keeps alpha. */
const HEX = /^#[0-9a-f]{6}$/i;

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="swatch-row">
        <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        <input
          type="color"
          className="swatch"
          aria-label={`${label} colour picker`}
          value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  );
}

/** A plain row for the controls that stay native (text inputs, selects). */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

/** Sound picker: the built-ins by name, or a custom URL, plus a preview that
 *  plays at whatever volume the alert is configured for. An empty value means
 *  "no sound", which is what the overlay already does with a null soundUrl. */
export function SoundField({
  label,
  value,
  onChange,
  volume,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  volume: number;
}) {
  const custom = value !== '' && !isBuiltInSound(value);
  const [showCustom, setShowCustom] = useState(custom);

  function play() {
    if (!value) return;
    const audio = new Audio(value);
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    void audio.play().catch(() => {
      /* autoplay refused, or the custom URL does not resolve — the preview is
         not worth an error dialog; Test fire reports real delivery problems. */
    });
  }

  return (
    <>
      <label className="field">
        <span className="field-label">{label}</span>
        <span className="sound-row">
          <select
            value={showCustom ? 'custom' : value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'custom') {
                setShowCustom(true);
                return;
              }
              setShowCustom(false);
              onChange(v);
            }}
          >
            <option value="">No sound</option>
            {BUILT_IN_SOUNDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value="custom">Custom URL…</option>
          </select>
          <button type="button" onClick={play} disabled={!value} aria-label="Preview sound">
            ▶
          </button>
        </span>
      </label>
      {showCustom && (
        <label className="field">
          <span className="field-label">Custom sound URL</span>
          <span className="field-control">
            <input
              value={value}
              placeholder="https://…"
              onChange={(e) => onChange(e.target.value)}
            />
          </span>
        </label>
      )}
    </>
  );
}
