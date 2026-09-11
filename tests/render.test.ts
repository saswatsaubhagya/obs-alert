import { expect, test } from 'vitest';
import { renderAlert, renderTemplate } from '@/lib/render';
import { BASE_STYLE } from '@/lib/eventTypes';

const cfg = {
  template: '{name} donated {amount}!',
  titleTemplate: 'DONATION',
  style: BASE_STYLE,
  durationMs: 6000,
  imageUrl: null,
  soundUrl: null,
  soundVolume: 80,
  locale: 'en-US',
};

test('substitutes declared variables', () => {
  expect(renderTemplate('{name} says hi', { name: 'bob' }, 'en-US')).toBe('bob says hi');
});

test('an unknown variable renders as empty string', () => {
  expect(renderTemplate('{name}{nope}!', { name: 'bob' }, 'en-US')).toBe('bob!');
});

test('formats amount as currency when a currency code is present', () => {
  const out = renderTemplate('{amount}', { amount: 500, currency: 'USD' }, 'en-US');
  expect(out).toBe('$500.00');
});

test('renders a bare number when no currency is given', () => {
  expect(renderTemplate('{amount}', { amount: 500 }, 'en-US')).toBe('500');
});

test('falls back to a bare number on an invalid currency code', () => {
  expect(renderTemplate('{amount}', { amount: 500, currency: 'NOPE' }, 'en-US')).toBe('500');
});

test('non-amount numbers are not currency formatted', () => {
  expect(renderTemplate('{viewers}', { viewers: 1200, currency: 'USD' }, 'en-US')).toBe('1,200');
});

test('does not re-substitute injected braces from donor text', () => {
  const out = renderTemplate('{name} donated', { name: '{amount}', amount: 999 }, 'en-US');
  expect(out).toBe('{amount} donated');
});

test('renders a full alert payload', () => {
  const a = renderAlert({
    eventTypeKey: 'donation',
    values: { name: 'bob', amount: 500, currency: 'INR', message: 'gg' },
    config: cfg,
  });
  expect(a.title).toBe('DONATION');
  expect(a.text).toContain('bob donated');
  expect(a.message).toBe('gg');
  expect(a.durationMs).toBe(6000);
  expect(a.id).toMatch(/[0-9a-f-]{36}/);
});

test('message travels as its own field, never interpolated into text', () => {
  const a = renderAlert({
    eventTypeKey: 'donation',
    values: { name: 'bob', amount: 1, message: '<script>alert(1)</script>' },
    config: cfg,
  });
  expect(a.text).not.toContain('<script>');
  expect(a.message).toBe('<script>alert(1)</script>');
});

test('clamps duration into 100..30000', () => {
  const lo = renderAlert({ eventTypeKey: 'follow', values: { name: 'b' }, config: { ...cfg, durationMs: 1 } });
  const hi = renderAlert({ eventTypeKey: 'follow', values: { name: 'b' }, config: { ...cfg, durationMs: 999999 } });
  expect(lo.durationMs).toBe(100);
  expect(hi.durationMs).toBe(30000);
});

test('a {message} token in a template does not interpolate donor text into text', () => {
  const a = renderAlert({
    eventTypeKey: 'donation',
    values: { name: 'bob', amount: 1, message: '<script>alert(1)</script>' },
    config: { ...cfg, template: '{name} says {message}' },
  });
  expect(a.text).not.toContain('<script>');
  expect(a.text).toBe('bob says ');
  expect(a.message).toBe('<script>alert(1)</script>');
});

test('a null title template yields an empty title', () => {
  const a = renderAlert({ eventTypeKey: 'follow', values: { name: 'b' }, config: { ...cfg, titleTemplate: null } });
  expect(a.title).toBe('');
});
