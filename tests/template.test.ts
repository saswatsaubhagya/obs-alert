import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as render from '@/lib/render';
import * as template from '@/lib/template';

// I4: the dashboard preview used to carry its own copy of renderTemplate and
// the `message` exclusion. One copy now, imported by both.
test('render.ts renders through the shared template module, not a copy', () => {
  expect(render.renderTemplate).toBe(template.renderTemplate);
  expect(render.formatValue).toBe(template.formatValue);
  expect(render.templateValues).toBe(template.templateValues);
  expect(render.clampDuration).toBe(template.clampDuration);
});

test('the message exclusion lives in one place', () => {
  expect(template.templateValues({ name: 'bob', message: 'hi' })).toEqual({ name: 'bob' });
});

// The preview imports src/lib/template.ts into the browser bundle, so it must
// stay free of Node built-ins — that constraint is the only reason the
// duplication existed in the first place.
test('the shared template module imports nothing Node-only', () => {
  const src = readFileSync(new URL('../src/lib/template.ts', import.meta.url), 'utf8');
  expect(src).not.toMatch(/from\s+'node:/);
});
