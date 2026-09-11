import { randomUUID } from 'node:crypto';
import type { Style } from './eventTypes';
import type { Values } from './validate';

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
  title: string;
  text: string;
  message: string;
  style: Style;
  durationMs: number;
  imageUrl: string | null;
  soundUrl: string | null;
  soundVolume: number;
};

function formatValue(name: string, value: string | number, values: Values, locale: string): string {
  if (typeof value !== 'number') return value;
  const currency = typeof values.currency === 'string' ? values.currency : undefined;
  if (name === 'amount' && currency) {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
    } catch {
      return new Intl.NumberFormat(locale).format(value); // unknown currency code
    }
  }
  return new Intl.NumberFormat(locale).format(value);
}

/** Single pass find-and-replace over a flat map: no expressions, no nesting, and
 *  substituted values are never rescanned, so donor text containing "{amount}"
 *  cannot pull in another field. */
export function renderTemplate(template: string, values: Values, locale: string): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = values[name];
    return v === undefined ? '' : formatValue(name, v, values, locale);
  });
}

export function renderAlert(input: {
  eventTypeKey: string;
  values: Values;
  config: RenderConfig;
}): AlertPayload {
  const { eventTypeKey, values, config } = input;
  const message = typeof values.message === 'string' ? values.message : '';
  return {
    id: randomUUID(),
    eventType: eventTypeKey,
    title: config.titleTemplate ? renderTemplate(config.titleTemplate, values, config.locale) : '',
    text: renderTemplate(config.template, values, config.locale),
    message,
    style: config.style,
    durationMs: Math.min(30000, Math.max(100, Math.round(config.durationMs))),
    imageUrl: config.imageUrl,
    soundUrl: config.soundUrl,
    soundVolume: config.soundVolume,
  };
}
