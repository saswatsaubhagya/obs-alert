import { beforeEach, expect, test } from 'vitest';
import { countFor, publish, subscribe, __reset } from '@/lib/hub';

beforeEach(() => __reset());

test('publish reaches every subscriber of that user and nobody else', () => {
  const a: string[] = [];
  const b: string[] = [];
  const c: string[] = [];
  subscribe('u1', (f) => a.push(f));
  subscribe('u1', (f) => b.push(f));
  subscribe('u2', (f) => c.push(f));

  expect(publish('u1', { text: 'hi' })).toBe(2);
  expect(a).toHaveLength(1);
  expect(b).toHaveLength(1);
  expect(c).toHaveLength(0);
});

test('frames are well-formed SSE carrying JSON', () => {
  const got: string[] = [];
  subscribe('u1', (f) => got.push(f));
  publish('u1', { text: 'bob followed' });
  expect(got[0]).toMatch(/^data: \{.*\}\n\n$/s);
  expect(JSON.parse(got[0].slice(6))).toEqual({ text: 'bob followed' });
});

test('publishing to a user with no subscribers returns 0', () => {
  expect(publish('nobody', { text: 'x' })).toBe(0);
});

test('unsubscribe removes the subscriber and cleans up the user entry', () => {
  const off = subscribe('u1', () => {});
  expect(countFor('u1')).toBe(1);
  off();
  expect(countFor('u1')).toBe(0);
  expect(publish('u1', { text: 'x' })).toBe(0);
});

test('a throwing subscriber is dropped and does not block the others', () => {
  const ok: string[] = [];
  subscribe('u1', () => {
    throw new Error('closed socket');
  });
  subscribe('u1', (f) => ok.push(f));

  expect(publish('u1', { text: 'x' })).toBe(1);
  expect(ok).toHaveLength(1);
  expect(countFor('u1')).toBe(1);
});

test('unsubscribing twice is harmless', () => {
  const off = subscribe('u1', () => {});
  off();
  off();
  expect(countFor('u1')).toBe(0);
});
