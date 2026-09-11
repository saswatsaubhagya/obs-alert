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

/**
 * A single-slot lane for dashboard previews: showing a new alert REPLACES
 * whatever is currently showing (cancels its timers/teardown immediately)
 * rather than queuing behind it, unlike createQueue's strictly serial lane
 * for live alerts. Both lanes can call the same `play` rendering code
 * (OverlayClient does), but they never share state — pushing to a
 * createQueue and calling show() on a createPreviewSlot do not interact.
 *
 * `play` must return a cancel function that immediately tears down whatever
 * it started (clear timers, remove DOM, stop audio) without invoking `done`.
 */
export function createPreviewSlot(opts: {
  play: (a: AlertPayload, done: () => void) => () => void;
}) {
  let current: { cancel: () => void } | null = null;

  return {
    show(a: AlertPayload) {
      current?.cancel();
      const slot: { cancel: () => void } = {
        cancel: () => {}, // replaced once opts.play returns below
      };
      current = slot;
      const cancel = opts.play(a, () => {
        if (current === slot) current = null; // a natural finish, not a replacement
      });
      slot.cancel = cancel;
    },
    clear() {
      current?.cancel();
      current = null;
    },
    active: () => current !== null,
  };
}
