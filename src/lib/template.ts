// The rendering contract, in one place. Deliberately free of `node:crypto`
// (and of anything else Node-only) so the dashboard's live preview can import
// the very same functions the server renders with instead of keeping a second
// copy in sync by hand — the preview's whole purpose is to be a faithful
// stand-in for what streams. `randomUUID` lives in renderAlert (src/lib/render.ts),
// which the browser never imports.
import type { Values } from './validate';

export function formatValue(name: string, value: string | number, values: Values, locale: string): string {
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

/** Clamped in one place so the live path and the dashboard preview cannot
 *  disagree about how long an alert stays on screen. */
export function clampDuration(ms: number): number {
  return Math.min(30000, Math.max(100, Math.round(Number(ms) || 0)));
}

/** The `message` exclusion (Ruling 11): a donor's message travels as its own
 *  payload field and is never interpolated into text/title, so it is removed
 *  from the values a template renders from. Shared by renderAlert and the
 *  dashboard preview so the rule can only ever be implemented once. */
export function templateValues(values: Values): Values {
  const { message: _message, ...rest } = values;
  return rest;
}
