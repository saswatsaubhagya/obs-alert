'use client';

import { useEffect, useRef } from 'react';
import { createPreviewSlot, createQueue } from '@/lib/queue';
import { PRESETS, type Preset } from '@/lib/eventTypes';
import type { AlertPayload } from '@/lib/render';

const POS: Record<string, string> = {
  'top-left': 'top:6vh;left:4vw',
  top: 'top:6vh;left:50%;transform:translateX(-50%)',
  'top-right': 'top:6vh;right:4vw',
  center: 'top:50%;left:50%;transform:translate(-50%,-50%)',
  'bottom-left': 'bottom:6vh;left:4vw',
  bottom: 'bottom:6vh;left:50%;transform:translateX(-50%)',
  'bottom-right': 'bottom:6vh;right:4vw',
};

const RESULT_PRESETS = new Set<Preset>(PRESETS);

export default function OverlayClient({ token }: { token: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    /** Appends card to root, triggers animation, and handles audio.
     *  Returns the { card, audio } shape for scheduleHide to work on both
     *  renderers identically. */
    const presentCard = (card: HTMLDivElement, a: AlertPayload) => {
      root.append(card);
      requestAnimationFrame(() => card.classList.add('in'));

      let audio: HTMLAudioElement | undefined;
      if (a.soundUrl) {
        audio = new Audio(a.soundUrl);
        audio.volume = Math.min(1, Math.max(0, (a.soundVolume ?? 80) / 100));
        void audio.play().catch(() => {}); // autoplay refusal must not stall the queue
      }

      return { card, audio };
    };

    /** Builds the alert DOM and starts it animating in. Every dynamic value is
     *  set with textContent or a style property — never innerHTML — so donor
     *  text cannot become markup. Shared by both the live queue and the
     *  preview slot below, so a preview can never render through a different
     *  path than a real alert. */
    const mountCard = (a: AlertPayload) => {
      const style = a.style ?? {};
      const card = document.createElement('div');
      card.className = `card anim-${style.anim ?? 'fade'}`;
      card.style.cssText = [
        POS[style.pos ?? 'top'] ?? POS.top,
        `--accent:${style.accent ?? '#7c5cff'}`,
        `--bg:${style.bg ?? 'rgba(12,12,16,0.86)'}`,
        `--fg:${style.fg ?? '#fff'}`,
        `--font:${style.font ?? 'system-ui, sans-serif'}`,
        `--size:${style.size ?? 34}px`,
        `--width:${style.width ?? 640}px`,
        `--radius:${style.radius ?? 16}px`,
      ].join(';');

      if (a.imageUrl) {
        const img = document.createElement('img');
        img.src = a.imageUrl;
        img.alt = '';
        card.append(img);
      }
      if (a.title) {
        const t = document.createElement('div');
        t.className = 'title';
        t.textContent = a.title;
        card.append(t);
      }
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = a.text;
      card.append(text);
      if (a.message) {
        const m = document.createElement('div');
        m.className = 'message';
        m.textContent = a.message;
        card.append(m);
      }

      return presentCard(card, a);
    };

    /** The result widget: a full-viewport layer rather than a positioned card.
     *  `pos`, `width` and `radius` are meaningless here and are ignored. Same
     *  textContent-only rule as mountCard — nothing here is ever innerHTML. */
    const mountResult = (a: AlertPayload) => {
      const style = a.style ?? {};
      const preset = RESULT_PRESETS.has(style.preset) ? style.preset : 'slam';
      const card = document.createElement('div');
      card.className = `result preset-${preset}`;
      card.style.cssText = [
        `--accent:${style.accent ?? '#7c5cff'}`,
        `--fg:${style.fg ?? '#fff'}`,
        `--font:${style.font ?? 'system-ui, sans-serif'}`,
        `--size:${style.size ?? 96}px`,
      ].join(';');

      const inner = document.createElement('div');
      inner.className = 'result-inner';
      if (a.title) {
        const t = document.createElement('div');
        t.className = 'result-title';
        t.textContent = a.title;
        inner.append(t);
      }
      const text = document.createElement('div');
      text.className = 'result-text';
      text.setAttribute('data-text', a.text);
      text.textContent = a.text;
      inner.append(text);
      if (a.message) {
        const m = document.createElement('div');
        m.className = 'result-message';
        m.textContent = a.message;
        inner.append(m);
      }
      const ring = document.createElement('div');
      ring.className = 'result-ring';
      card.append(ring, inner);

      if (preset === 'confetti') {
        for (let i = 0; i < 30; i++) {
          const bit = document.createElement('span');
          bit.className = 'confetti-bit';
          // Every value here is ours, not the user's — no injection surface.
          bit.style.left = `${Math.random() * 100}%`;
          bit.style.animationDelay = `${Math.random() * 600}ms`;
          bit.style.animationDuration = `${1400 + Math.random() * 1200}ms`;
          bit.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
          bit.style.opacity = String(0.6 + Math.random() * 0.4);
          card.append(bit);
        }
      }

      return presentCard(card, a);
    };

    /** Frames choose their renderer; everything downstream (queueing, hiding,
     *  the preview lane) is identical for both widgets. */
    const mount = (a: AlertPayload) => (a.widget === 'result' ? mountResult(a) : mountCard(a));

    /** Schedules a mounted card's fade-out + removal after `durationMs`, then
     *  calls `done`. Returns a cancel function that tears the card down
     *  immediately (no fade, no `done`) — used by the preview lane to replace
     *  a still-showing preview without waiting out its remaining time. */
    const scheduleHide = (
      card: HTMLDivElement,
      audio: HTMLAudioElement | undefined,
      durationMs: number,
      done: () => void
    ) => {
      let removeTimer: ReturnType<typeof setTimeout> | undefined;
      const hideTimer = setTimeout(() => {
        card.classList.remove('in');
        removeTimer = setTimeout(() => {
          card.remove();
          audio?.pause();
          done();
        }, 400);
      }, durationMs);

      return () => {
        clearTimeout(hideTimer);
        clearTimeout(removeTimer);
        card.remove();
        audio?.pause();
      };
    };

    // Live lane: strictly serial (createQueue) so real alerts never overlap.
    const queue = createQueue({
      play: (a, done) => {
        const { card, audio } = mount(a);
        scheduleHide(card, audio, a.durationMs ?? 5000, done);
      },
    });

    // Preview lane: replaces whatever preview is currently showing instead of
    // queuing behind it, so rapid edits in the dashboard don't backlog behind
    // each other's full durationMs. Entirely separate from `queue` — a
    // preview never advances or is advanced by the live lane.
    const previewSlot = createPreviewSlot({
      play: (a, done) => {
        const { card, audio } = mount(a);
        return scheduleHide(card, audio, a.durationMs ?? 5000, done);
      },
    });

    const es = new EventSource(`/api/overlay/${token}/events`);
    es.onmessage = (e) => {
      try {
        queue.push(JSON.parse(e.data) as AlertPayload);
      } catch {
        /* ignore a malformed frame */
      }
    };

    // Dashboard live preview: same-origin parent posts a rendered alert.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.kind === 'preview-alert') previewSlot.show(e.data.alert as AlertPayload);
    };
    window.addEventListener('message', onMessage);

    return () => {
      es.close();
      window.removeEventListener('message', onMessage);
      previewSlot.clear();
    };
  }, [token]);

  return (
    <>
      <style>{`
        html,body{margin:0;background:transparent;overflow:hidden}
        .card{position:fixed;width:var(--width);max-width:92vw;box-sizing:border-box;
          padding:20px 24px;border-radius:var(--radius);background:var(--bg);color:var(--fg);
          font-family:var(--font);font-size:var(--size);text-align:center;
          border-top:4px solid var(--accent);opacity:0;transition:opacity .35s, transform .35s}
        .card.in{opacity:1}
        .anim-slide{translate:0 -24px} .anim-slide.in{translate:0 0}
        .anim-pop{scale:.88} .anim-pop.in{scale:1}
        .card img{display:block;margin:0 auto 12px;max-width:100%;max-height:34vh}
        .title{font-size:.42em;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
        .text{font-weight:700;line-height:1.2;word-break:break-word}
        .message{margin-top:10px;font-size:.5em;opacity:.85;word-break:break-word}

        .result{position:fixed;inset:0;display:grid;place-items:center;
          font-family:var(--font);color:var(--fg);opacity:0;transition:opacity .3s}
        .result.in{opacity:1}
        .result-inner{text-align:center;padding:0 6vw}
        .result-title{font-size:calc(var(--size) * .22);letter-spacing:.32em;
          text-transform:uppercase;color:var(--accent);margin-bottom:10px}
        .result-text{font-size:var(--size);font-weight:900;line-height:1;
          letter-spacing:-.02em;text-transform:uppercase;word-break:break-word;
          text-shadow:0 0 42px var(--accent)}
        .result-message{margin-top:16px;font-size:calc(var(--size) * .2);opacity:.85;word-break:break-word}
        .result-ring{position:absolute;top:50%;left:50%;width:10vmin;height:10vmin;
          margin:-5vmin 0 0 -5vmin;border:3px solid var(--accent);border-radius:50%;opacity:0}
        .result.in .result-ring{animation:ring .7s ease-out forwards}
        @keyframes ring{from{opacity:.7;scale:.2}to{opacity:0;scale:9}}

        .preset-slam .result-inner,.preset-confetti .result-inner{scale:2.6;opacity:0}
        .preset-slam.in .result-inner,.preset-confetti.in .result-inner{
          animation:slam .38s cubic-bezier(.2,1.5,.4,1) forwards}
        @keyframes slam{from{scale:2.6;opacity:0}60%{scale:.94;opacity:1}to{scale:1;opacity:1}}

        .confetti-bit{position:absolute;top:-4vh;width:10px;height:16px;
          background:var(--accent);border-radius:2px;animation-name:fall;
          animation-timing-function:linear;animation-fill-mode:forwards}
        @keyframes fall{to{transform:translateY(112vh) rotate(var(--spin))}}

        .preset-glitch .result-text{position:relative}
        .preset-glitch.in .result-text{animation:jitter .28s steps(2,end) 6}
        .preset-glitch .result-text::before,.preset-glitch .result-text::after{
          content:attr(data-text);position:absolute;inset:0;opacity:.8}
        .preset-glitch .result-text::before{color:var(--accent);translate:-3px 0}
        .preset-glitch .result-text::after{color:#0ff;translate:3px 0;mix-blend-mode:screen}
        @keyframes jitter{0%{translate:0 0}25%{translate:-6px 2px}50%{translate:5px -2px}
          75%{translate:-3px -3px}100%{translate:0 0}}
      `}</style>
      <div ref={rootRef} />
    </>
  );
}
