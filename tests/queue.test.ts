import { expect, test, vi } from 'vitest';
import { createQueue } from '@/lib/queue';
import type { AlertPayload } from '@/lib/render';

const alert = (id: string) => ({ id, text: id }) as AlertPayload;

test('plays alerts one at a time, in order', () => {
  const played: string[] = [];
  let finish = () => {};
  const q = createQueue({
    play: (a, done) => {
      played.push(a.id);
      finish = done;
    },
  });

  q.push(alert('a'));
  q.push(alert('b'));
  expect(played).toEqual(['a']); // b waits

  finish();
  expect(played).toEqual(['a', 'b']);
});

test('an idle queue plays immediately', () => {
  const played: string[] = [];
  const q = createQueue({ play: (a, done) => { played.push(a.id); done(); } });
  q.push(alert('a'));
  expect(played).toEqual(['a']);
  expect(q.size()).toBe(0);
});

test('drops the oldest waiting alert beyond the cap', () => {
  const played: string[] = [];
  const q = createQueue({ cap: 2, play: (a) => played.push(a.id) }); // never calls done
  q.push(alert('playing'));
  q.push(alert('w1'));
  q.push(alert('w2'));
  q.push(alert('w3'));

  expect(played).toEqual(['playing']);
  expect(q.size()).toBe(2);
  expect(q.dropped()).toBe(1);
});

test('a throwing play call does not wedge the queue', () => {
  const played: string[] = [];
  const q = createQueue({
    play: (a, done) => {
      played.push(a.id);
      if (a.id === 'bad') throw new Error('audio failed');
      done();
    },
  });
  q.push(alert('bad'));
  q.push(alert('good'));
  expect(played).toEqual(['bad', 'good']);
});

test('done called twice advances only once', () => {
  // Capture each alert's own `done` by index, rather than a single reassigned
  // variable: the queue advances synchronously (see the first test), so a
  // shared `let finish = done` variable gets overwritten by the *next*
  // alert's fresh done before the test can re-invoke the stale one. Indexing
  // by call lets us hold onto alert 'a's specific done and call that exact
  // stale reference a second time.
  const played: string[] = [];
  const dones: Array<() => void> = [];
  const q = createQueue({ play: (a, done) => { played.push(a.id); dones.push(done); } });
  q.push(alert('a'));
  q.push(alert('b'));
  q.push(alert('c'));
  dones[0](); // finishes 'a', advances to 'b'
  const afterFirst = [...played];
  dones[0](); // stale callback from the already-finished alert 'a'
  expect(played).toEqual(afterFirst);
});

test('ten alerts fired at once all play, none lost', () => {
  const played: string[] = [];
  const q = createQueue({ play: (a, done) => { played.push(a.id); done(); } });
  for (let i = 0; i < 10; i++) q.push(alert(`a${i}`));
  expect(played).toHaveLength(10);
  expect(q.dropped()).toBe(0);
});
