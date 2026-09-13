import { randomUUID } from 'node:crypto';
import { BUILT_IN, type Style, type Widget } from './eventTypes';
import { clampDuration, renderTemplate, templateValues } from './template';
import type { Values } from './validate';

// The template functions themselves live in src/lib/template.ts so the
// dashboard preview can import them without pulling `node:crypto` into the
// browser bundle. Re-exported here because this module is the rendering entry
// point everything else already imports.
export { clampDuration, formatValue, renderTemplate, templateValues } from './template';

export type RenderConfig = {
  template: string;
  titleTemplate: string | null;
  style: Style;
  durationMs: number;
  imageUrl: string | null;
  soundUrl: string | null;
  soundVolume: number;
  locale: string;
};

export type AlertPayload = {
  id: string;
  eventType: string;
  widget: Widget;
  title: string;
  text: string;
  message: string;
  style: Style;
  durationMs: number;
  imageUrl: string | null;
  soundUrl: string | null;
  soundVolume: number;
};

export function renderAlert(input: {
  eventTypeKey: string;
  values: Values;
  config: RenderConfig;
}): AlertPayload {
  const { eventTypeKey, values, config } = input;
  const message = typeof values.message === 'string' ? values.message : '';
  // message travels as its own payload field and must never be interpolated
  // into text/title, so it is excluded from the values templates render from.
  const forTemplate = templateValues(values);
  return {
    id: randomUUID(),
    eventType: eventTypeKey,
    // Which renderer the overlay should use for this frame. Unknown keys
    // cannot reach here through sendAlert (it 400s first), so the fallback is
    // only for direct callers in tests.
    widget: BUILT_IN[eventTypeKey]?.widget ?? 'alerts',
    title: config.titleTemplate ? renderTemplate(config.titleTemplate, forTemplate, config.locale) : '',
    text: renderTemplate(config.template, forTemplate, config.locale),
    message,
    style: config.style,
    durationMs: clampDuration(config.durationMs),
    imageUrl: config.imageUrl,
    soundUrl: config.soundUrl,
    soundVolume: config.soundVolume,
  };
}
