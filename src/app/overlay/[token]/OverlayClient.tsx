'use client';

import { useEffect, useRef } from 'react';
import { createPreviewSlot, createQueue } from '@/lib/queue';
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

export default function OverlayClient({ token }: { token: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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
        const { card, audio } = mountCard(a);
        scheduleHide(card, audio, a.durationMs ?? 5000, done);
      },
    });

    // Preview lane: replaces whatever preview is currently showing instead of
    // queuing behind it, so rapid edits in the dashboard don't backlog behind
    // each other's full durationMs. Entirely separate from `queue` — a
    // preview never advances or is advanced by the live lane.
    const previewSlot = createPreviewSlot({
      play: (a, done) => {
        const { card, audio } = mountCard(a);
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
      `}</style>
      <div ref={rootRef} />
    </>
  );
}
