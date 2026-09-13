import { expect, test } from 'vitest';
import { BUILT_IN, PRESETS } from '@/lib/eventTypes';

test('every built-in type declares a widget, fields and defaults', () => {
  expect(Object.keys(BUILT_IN).sort()).toEqual([
    'donation',
    'follow',
    'lose',
    'raid',
    'sub',
    'win',
  ]);
  for (const [key, t] of Object.entries(BUILT_IN)) {
    expect(t.label, key).toBeTruthy();
    expect(['alerts', 'result'], key).toContain(t.widget);
    expect(t.fields.length, key).toBeGreaterThan(0);
    expect(t.defaults.template, key).toBeTruthy();
    expect(t.defaults.durationMs, key).toBeGreaterThanOrEqual(100);
    expect(PRESETS, key).toContain(t.defaults.style.preset);
  }
});

test('the four alert types stay on the alerts widget', () => {
  for (const key of ['donation', 'follow', 'sub', 'raid']) {
    expect(BUILT_IN[key].widget, key).toBe('alerts');
  }
});

test('win and lose are result-widget types with optional fields only', () => {
  for (const key of ['win', 'lose']) {
    expect(BUILT_IN[key].widget, key).toBe('result');
    expect(BUILT_IN[key].fields.every((f) => !f.required), key).toBe(true);
  }
});

test('every default template only references declared fields', () => {
  for (const [key, t] of Object.entries(BUILT_IN)) {
    const declared = new Set(t.fields.map((f) => f.name));
    const used = [...t.defaults.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const v of used) expect(declared.has(v), `${key} uses {${v}}`).toBe(true);
  }
});

test('donation declares a required numeric amount', () => {
  const amount = BUILT_IN.donation.fields.find((f) => f.name === 'amount');
  expect(amount).toEqual({ name: 'amount', type: 'number', required: true });
});
