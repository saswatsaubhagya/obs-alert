import { expect, test } from 'vitest';
import { BUILT_IN } from '@/lib/eventTypes';

test('every built-in type declares fields and defaults', () => {
  expect(Object.keys(BUILT_IN).sort()).toEqual(['donation', 'follow', 'raid', 'sub']);
  for (const [key, t] of Object.entries(BUILT_IN)) {
    expect(t.label, key).toBeTruthy();
    expect(t.fields.length, key).toBeGreaterThan(0);
    expect(t.defaults.template, key).toBeTruthy();
    expect(t.defaults.durationMs, key).toBeGreaterThanOrEqual(100);
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
