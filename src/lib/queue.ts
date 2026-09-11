import type { AlertPayload } from './render';

export function createQueue(opts: {
  cap?: number;
  play: (a: AlertPayload, done: () => void) => void;
}) {
  const cap = opts.cap ?? 50;
  const waiting: AlertPayload[] = [];
  let busy = false;
  let dropped = 0;

  function next() {
    const a = waiting.shift();
    if (!a) {
      busy = false;
      return;
    }
    busy = true;
    let settled = false;
    const done = () => {
      if (settled) return; // a stale callback must not advance twice
      settled = true;
      next();
    };
    try {
      opts.play(a, done);
    } catch {
      done(); // a broken alert must not wedge the overlay
    }
  }

  return {
    push(a: AlertPayload) {
      waiting.push(a);
      while (waiting.length > cap) {
        waiting.shift();
        dropped++;
      }
      if (!busy) next();
    },
    size: () => waiting.length,
    dropped: () => dropped,
  };
}
