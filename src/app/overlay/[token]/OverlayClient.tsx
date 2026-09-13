'use client';

import { useEffect, useRef } from 'react';
import { createPreviewSlot, createQueue } from '@/lib/queue';
import { PRESETS, type Preset, type Widget } from '@/lib/eventTypes';
import { parseScoreConfig, type ScoreConfig } from '@/lib/scoreConfig';
import { formatClock, parseTimerConfig, type TimerConfig } from '@/lib/timerConfig';
import {
  PLATFORM_META,
  parseSocialsConfig,
  type SocialAccount,
  type SocialsConfig,
} from '@/lib/socialsConfig';
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

/** Confetti palette. Deliberately not the user's accent alone: a real cannon
 *  throws mixed colours. The accent still leads, so the burst reads as theirs. */
const CONFETTI_COLORS = ['#ffd166', '#31d0aa', '#4cc9f0', '#ff5c8a', '#f7f7ff', '#b892ff'];

/** The four cannons, one per corner, aimed inward. Offsets are vw/vh so a
 *  burst covers the same fraction of any Browser Source size. */
const CANNONS: readonly { x: string; y: string; dx: [number, number]; dy: [number, number] }[] = [
  { x: '0%', y: '100%', dx: [14, 78], dy: [-86, -22] },
  { x: '100%', y: '100%', dx: [-78, -14], dy: [-86, -22] },
  { x: '0%', y: '0%', dx: [14, 78], dy: [22, 70] },
  { x: '100%', y: '0%', dx: [-78, -14], dy: [22, 70] },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export default function OverlayClient({
  token,
  widget,
}: {
  token: string;
  widget: Widget | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    /** A Browser Source pinned to one widget drops every other widget's
     *  frames. `widget === null` is the all-widgets URL and accepts them all.
     *  Applied to the live and preview lanes alike, so the dashboard preview
     *  shows exactly what this source would show on stream. */
    const accepts = (a: AlertPayload) => widget === null || a.widget === widget;

    /** The scoreboard: one element that is updated in place and never leaves.
     *  Created on the first score frame, so a source pinned to another widget
     *  (or one whose user has never scored) renders nothing at all. Every
     *  frame carries the whole config, so an appearance change lands the same
     *  way a count change does: no reload of the Browser Source. */
    let board: { el: HTMLDivElement; parts: Record<string, HTMLElement> } | null = null;

    const showScore = (wins: number, losses: number, raw: unknown) => {
      // The config arrives over the wire; parseScoreConfig falls back to the
      // defaults per field rather than letting a bad value reach cssText.
      const c: ScoreConfig = parseScoreConfig(raw);
      if (!board) {
        const el = document.createElement('div');
        el.className = 'score';
        const parts: Record<string, HTMLElement> = {};
        const side = (which: 'w' | 'l') => {
          const col = document.createElement('div');
          col.className = 'score-side';
          const label = document.createElement('div');
          label.className = 'score-label';
          const n = document.createElement('div');
          n.className = `score-n score-${which}`;
          col.append(label, n);
          parts[`${which}Label`] = label;
          parts[which] = n;
          return col;
        };
        const left = side('w');
        const sep = document.createElement('div');
        sep.className = 'score-sep';
        parts.sep = sep;
        const right = side('l');
        el.append(left, sep, right);
        root.append(el);
        board = { el, parts };
      }

      board.el.style.cssText = [
        POS[c.pos] ?? POS.top,
        `--win:${c.winColor}`,
        `--loss:${c.lossColor}`,
        `--label:${c.labelColor}`,
        `--bg:${c.bg}`,
        `--font:${c.font}`,
        `--size:${c.size}px`,
      ].join(';');
      board.parts.w.textContent = String(wins);
      board.parts.l.textContent = String(losses);
      board.parts.sep.textContent = c.separator;
      board.parts.wLabel.textContent = c.winLabel;
      board.parts.lLabel.textContent = c.lossLabel;
      board.el.dataset.labels = c.showLabels ? 'on' : 'off';
    };

    /** The timer: like the scoreboard, one element updated in place and never
     *  removed — but it also has to keep moving between frames, so the server
     *  sends `remainingMs` as of the moment it published and this ticks down
     *  locally from when the frame arrived. Nothing here reads the server's
     *  wall clock, so a streaming PC whose clock is minutes off still counts
     *  down correctly. */
    let clock: { el: HTMLDivElement; label: HTMLElement; time: HTMLElement } | null = null;
    let ticking: ReturnType<typeof setInterval> | undefined;
    let timerState: { running: boolean; remainingMs: number; at: number; config: TimerConfig } | null = null;

    const paintTimer = () => {
      if (!timerState || !clock) return;
      const { running, remainingMs, at, config: c } = timerState;
      const left = running ? Math.max(0, remainingMs - (Date.now() - at)) : remainingMs;
      const done = left <= 0;
      clock.el.dataset.hidden = done && c.hideAtZero ? 'on' : 'off';
      clock.time.textContent = done && c.endText ? c.endText : formatClock(left, c.format);
      clock.label.textContent = c.label;
      clock.el.dataset.labels = c.showLabel && c.label ? 'on' : 'off';
      // The warning colour is for the run-in to zero, not for a finished clock.
      clock.el.dataset.warn = !done && c.warnAtSec > 0 && left <= c.warnAtSec * 1000 ? 'on' : 'off';
    };

    const showTimer = (running: boolean, remainingMs: number, raw: unknown) => {
      // The config arrives over the wire; parseTimerConfig falls back to the
      // defaults per field rather than letting a bad value reach cssText.
      const c: TimerConfig = parseTimerConfig(raw);
      if (!clock) {
        const el = document.createElement('div');
        el.className = 'timer';
        const label = document.createElement('div');
        label.className = 'timer-label';
        const time = document.createElement('div');
        time.className = 'timer-time';
        el.append(label, time);
        root.append(el);
        clock = { el, label, time };
        // A quarter of a second: the seconds digit never looks stuck, and the
        // cost is four textContent writes a second in a Browser Source.
        ticking = setInterval(paintTimer, 250);
      }
      clock.el.style.cssText = [
        POS[c.pos] ?? POS.top,
        `--fg:${c.color}`,
        `--warn:${c.warnColor}`,
        `--label:${c.labelColor}`,
        `--bg:${c.bg}`,
        `--font:${c.font}`,
        `--size:${c.size}px`,
      ].join(';');
      timerState = { running, remainingMs: Math.max(0, remainingMs), at: Date.now(), config: c };
      paintTimer();
    };

    /** The socials widget: one element, like the scoreboard and the timer, but
     *  it also drives itself. The server only ever says "here is the config";
     *  which account is on screen, and when it steps to the next one, is this
     *  timer chain. A config frame restarts the chain from the top, so an edit
     *  in the dashboard is visible immediately instead of at the end of the
     *  current lap. */
    let socials: {
      el: HTMLDivElement;
      icon: SVGSVGElement;
      label: HTMLElement;
      handle: HTMLElement;
    } | null = null;
    let socialsTimer: ReturnType<typeof setTimeout> | undefined;
    let socialsIdx = 0;

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** Draws a platform glyph. Every value comes from PLATFORM_META — ours,
     *  never the user's — and is set with setAttribute rather than innerHTML,
     *  so the icons go through the same no-markup rule as the text. */
    const paintIcon = (svg: SVGSVGElement, platform: SocialAccount['platform']) => {
      svg.replaceChildren();
      for (const shape of PLATFORM_META[platform].icon) {
        const node = document.createElementNS(SVG_NS, shape.t === 'rect' ? 'rect' : shape.t);
        if (shape.t === 'path') node.setAttribute('d', shape.d);
        if (shape.t === 'circle') {
          node.setAttribute('cx', String(shape.cx));
          node.setAttribute('cy', String(shape.cy));
          node.setAttribute('r', String(shape.r));
        }
        if (shape.t === 'rect') {
          node.setAttribute('x', String(shape.x));
          node.setAttribute('y', String(shape.y));
          node.setAttribute('width', String(shape.w));
          node.setAttribute('height', String(shape.h));
          node.setAttribute('rx', String(shape.rx));
        }
        svg.append(node);
      }
    };

    const paintSocial = (acc: SocialAccount, c: SocialsConfig) => {
      if (!socials) return;
      const meta = PLATFORM_META[acc.platform];
      socials.el.style.setProperty('--icon', c.useBrandColor ? meta.brand : c.color);
      socials.label.textContent = meta.label;
      socials.handle.textContent = acc.handle;
      if (c.showIcon) paintIcon(socials.icon, acc.platform);
      socials.el.dataset.icon = c.showIcon ? 'on' : 'off';
      socials.el.dataset.labels = c.showLabel ? 'on' : 'off';
    };

    const cycleSocials = (c: SocialsConfig) => {
      if (!socials) return;
      if (c.accounts.length === 0) {
        socials.el.dataset.on = 'off';
        return;
      }
      const acc =
        c.order === 'random' ? pick(c.accounts) : c.accounts[socialsIdx % c.accounts.length];
      socialsIdx++;
      paintSocial(acc, c);
      socials.el.dataset.on = 'on';
      // One account with no gap is a permanent plug: nothing left to schedule.
      if (c.gapSec === 0 && c.accounts.length === 1) return;
      socialsTimer = setTimeout(() => {
        if (c.gapSec === 0) {
          cycleSocials(c);
          return;
        }
        if (socials) socials.el.dataset.on = 'off';
        socialsTimer = setTimeout(() => cycleSocials(c), c.gapSec * 1000);
      }, c.showSec * 1000);
    };

    const showSocials = (raw: unknown) => {
      // The config arrives over the wire; parseSocialsConfig falls back to the
      // defaults per field rather than letting a bad value reach cssText.
      const c: SocialsConfig = parseSocialsConfig(raw);
      if (!socials) {
        const el = document.createElement('div');
        el.className = 'socials';
        const icon = document.createElementNS(SVG_NS, 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('class', 'social-icon');
        const text = document.createElement('div');
        text.className = 'social-text';
        const label = document.createElement('div');
        label.className = 'social-label';
        const handle = document.createElement('div');
        handle.className = 'social-handle';
        text.append(label, handle);
        el.append(icon, text);
        root.append(el);
        socials = { el, icon, label, handle };
      }
      socials.el.className = `socials anim-${c.anim}`;
      socials.el.style.cssText = [
        POS[c.pos] ?? POS['bottom-left'],
        `--fg:${c.color}`,
        `--label:${c.labelColor}`,
        `--bg:${c.bg}`,
        `--font:${c.font}`,
        `--size:${c.size}px`,
      ].join(';');
      clearTimeout(socialsTimer);
      socialsIdx = 0;
      cycleSocials(c);
    };

    /** Appends card to root, triggers animation, and handles audio.
     *  Returns the { card, audio } shape for scheduleHide to work on both
     *  renderers identically. */
    const presentCard = (card: HTMLDivElement, a: AlertPayload) => {
      root.append(card);
      void card.offsetHeight; // force reflow so the transition runs from the pre-`in` state
      card.classList.add('in');

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
        // Every value below is ours, not the user's — no injection surface.
        // Layer 1: a slow fall over the whole frame, so the celebration keeps
        // going after the bursts have landed.
        for (let i = 0; i < 44; i++) {
          const bit = document.createElement('span');
          bit.className = 'confetti-bit fall';
          bit.style.left = `${Math.random() * 100}%`;
          bit.style.background = pick(CONFETTI_COLORS);
          bit.style.animationDelay = `${Math.random() * 900}ms`;
          bit.style.animationDuration = `${1800 + Math.random() * 1800}ms`;
          bit.style.setProperty('--spin', `${rand(-720, 720)}deg`);
          bit.style.setProperty('--sway', `${rand(-12, 12)}vw`);
          bit.style.opacity = String(0.65 + Math.random() * 0.35);
          if (i % 3 === 0) bit.style.borderRadius = '50%';
          if (i % 4 === 0) bit.style.height = '9px';
          card.append(bit);
        }
        // Layer 2: four corner cannons fired inward, then gravity takes them.
        for (const c of CANNONS) {
          for (let i = 0; i < 18; i++) {
            const bit = document.createElement('span');
            bit.className = 'confetti-bit burst';
            bit.style.left = c.x;
            bit.style.top = c.y;
            bit.style.background = pick(CONFETTI_COLORS);
            bit.style.animationDelay = `${Math.random() * 260}ms`;
            bit.style.animationDuration = `${1500 + Math.random() * 900}ms`;
            bit.style.setProperty('--dx', `${rand(c.dx[0], c.dx[1])}vw`);
            bit.style.setProperty('--dy', `${rand(c.dy[0], c.dy[1])}vh`);
            bit.style.setProperty('--spin', `${rand(-900, 900)}deg`);
            if (i % 3 === 0) bit.style.borderRadius = '50%';
            card.append(bit);
          }
        }
      }

      if (preset === 'glitch') {
        // The loss counterpart: a dark vignette closing in, plus embers/ash
        // drifting down instead of confetti going up.
        const vig = document.createElement('div');
        vig.className = 'result-vignette';
        card.append(vig);
        for (let i = 0; i < 34; i++) {
          const bit = document.createElement('span');
          bit.className = 'ash-bit';
          bit.style.left = `${Math.random() * 100}%`;
          bit.style.animationDelay = `${Math.random() * 1200}ms`;
          bit.style.animationDuration = `${2200 + Math.random() * 2000}ms`;
          bit.style.setProperty('--sway', `${rand(-8, 8)}vw`);
          bit.style.setProperty('--spin', `${rand(-200, 200)}deg`);
          const px = 3 + Math.random() * 4;
          bit.style.width = `${px}px`;
          bit.style.height = `${px}px`;
          if (i % 4 === 0) bit.style.background = 'var(--accent)';
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
        const a = JSON.parse(e.data) as AlertPayload;
        if (!accepts(a)) return;
        // A score frame is state, not an alert: it must never enter the queue
        // (nothing would ever advance it) and never expires.
        if (a.widget === 'score') {
          const f = a as unknown as { wins?: number; losses?: number; config?: unknown };
          showScore(f.wins ?? 0, f.losses ?? 0, f.config);
          return;
        }
        if (a.widget === 'timer') {
          const f = a as unknown as { running?: boolean; remainingMs?: number; config?: unknown };
          showTimer(f.running === true, f.remainingMs ?? 0, f.config);
          return;
        }
        if (a.widget === 'socials') {
          showSocials((a as unknown as { config?: unknown }).config);
          return;
        }
        queue.push(a);
      } catch {
        /* ignore a malformed frame */
      }
    };

    // Dashboard live preview: same-origin parent posts a rendered alert.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.kind !== 'preview-alert') return;
      const a = e.data.alert as AlertPayload;
      if (!accepts(a)) return;
      // Same split as the live lane: a score preview paints the board rather
      // than playing through the preview slot, so the dashboard shows exactly
      // what a Browser Source would.
      if (a.widget === 'score') {
        const f = a as unknown as { wins?: number; losses?: number; config?: unknown };
        showScore(f.wins ?? 0, f.losses ?? 0, f.config);
        return;
      }
      if (a.widget === 'timer') {
        const f = a as unknown as { running?: boolean; remainingMs?: number; config?: unknown };
        showTimer(f.running === true, f.remainingMs ?? 0, f.config);
        return;
      }
      if (a.widget === 'socials') {
        showSocials((a as unknown as { config?: unknown }).config);
        return;
      }
      previewSlot.show(a);
    };
    window.addEventListener('message', onMessage);

    return () => {
      es.close();
      window.removeEventListener('message', onMessage);
      previewSlot.clear();
      clearInterval(ticking);
      clearTimeout(socialsTimer);
    };
  }, [token, widget]);

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

        .score{position:fixed;display:flex;align-items:center;gap:.3em;
          padding:.2em .55em;border-radius:.22em;background:var(--bg);
          font-family:var(--font);font-size:var(--size);font-weight:900;
          line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
        .score-side{display:grid;justify-items:center;gap:.12em}
        .score-label{font-size:.22em;font-weight:800;letter-spacing:.2em;
          text-transform:uppercase;color:var(--label);opacity:.75;white-space:nowrap}
        .score[data-labels="off"] .score-label{display:none}
        .score-w{color:var(--win)} .score-l{color:var(--loss)}
        .score-sep{color:var(--label);opacity:.45}

        .timer{position:fixed;display:grid;justify-items:center;gap:.1em;
          padding:.18em .5em;border-radius:.22em;background:var(--bg);
          font-family:var(--font);font-size:var(--size);font-weight:900;
          line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;
          color:var(--fg)}
        .timer[data-hidden="on"]{display:none}
        .timer-label{font-size:.22em;font-weight:800;letter-spacing:.2em;
          text-transform:uppercase;color:var(--label);opacity:.75;white-space:nowrap}
        .timer[data-labels="off"] .timer-label{display:none}
        .timer[data-warn="on"] .timer-time{color:var(--warn);animation:timer-pulse 1s ease-in-out infinite}
        @keyframes timer-pulse{50%{opacity:.55}}

        .socials{position:fixed;display:flex;align-items:center;gap:.45em;
          padding:.3em .6em;border-radius:.25em;background:var(--bg);
          font-family:var(--font);font-size:var(--size);color:var(--fg);
          line-height:1.05;white-space:nowrap;opacity:0;
          transition:opacity .4s ease, translate .4s ease, scale .4s ease}
        .socials[data-on="on"]{opacity:1}
        .socials.anim-slide{translate:0 14px}
        .socials.anim-slide[data-on="on"]{translate:0 0}
        .socials.anim-pop{scale:.88}
        .socials.anim-pop[data-on="on"]{scale:1}
        .social-icon{width:1.15em;height:1.15em;flex:none;fill:none;
          stroke:var(--icon);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .socials[data-icon="off"] .social-icon{display:none}
        .social-label{font-size:.3em;font-weight:800;letter-spacing:.2em;
          text-transform:uppercase;color:var(--label);opacity:.7;margin-bottom:.25em}
        .socials[data-labels="off"] .social-label{display:none}
        .social-handle{font-weight:800;letter-spacing:-.01em}

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

        .preset-slam.in .result-inner,.preset-confetti.in .result-inner{
          animation:slam .38s cubic-bezier(.2,1.5,.4,1) both}
        @keyframes slam{from{scale:2.6;opacity:0}60%{scale:.94;opacity:1}to{scale:1;opacity:1}}

        .confetti-bit{position:absolute;width:10px;height:16px;
          background:var(--accent);border-radius:2px;animation-fill-mode:both}
        .confetti-bit.fall{top:-6vh;animation-name:fall;animation-timing-function:linear}
        @keyframes fall{
          0%{transform:translate3d(0,0,0) rotate(0deg)}
          50%{transform:translate3d(var(--sway),56vh,0) rotate(calc(var(--spin) * .5))}
          100%{transform:translate3d(0,118vh,0) rotate(var(--spin))}}
        /* Cannon: launch on an ease-out, then let gravity carry it off-frame. */
        .confetti-bit.burst{animation-name:burst;
          animation-timing-function:cubic-bezier(.12,.72,.32,1)}
        @keyframes burst{
          0%{transform:translate3d(0,0,0) rotate(0deg) scale(.6);opacity:1}
          55%{transform:translate3d(var(--dx),var(--dy),0)
            rotate(calc(var(--spin) * .55)) scale(1);opacity:1}
          100%{transform:translate3d(calc(var(--dx) * 1.15),calc(var(--dy) + 75vh),0)
            rotate(var(--spin)) scale(1);opacity:0}}

        /* Loss: the whole layer shudders once, ash falls, the frame darkens. */
        .preset-glitch.in{animation:shudder .5s cubic-bezier(.36,.07,.19,.97) both}
        @keyframes shudder{0%,100%{translate:0 0}
          12%{translate:-9px 3px}28%{translate:8px -4px}44%{translate:-6px -2px}
          62%{translate:5px 3px}80%{translate:-2px 0}}
        .result-vignette{position:absolute;inset:0;pointer-events:none;
          background:radial-gradient(ellipse at center,transparent 32%,rgba(0,0,0,.82) 100%);
          opacity:0}
        .preset-glitch.in .result-vignette{animation:vignette 1.1s ease-out both}
        @keyframes vignette{0%{opacity:0;scale:1.4}60%{opacity:1;scale:1}100%{opacity:.85;scale:1}}
        .ash-bit{position:absolute;top:-4vh;width:4px;height:4px;border-radius:50%;
          background:rgba(210,210,220,.55);animation-name:ash;
          animation-timing-function:linear;animation-fill-mode:both}
        @keyframes ash{
          0%{transform:translate3d(0,0,0) rotate(0deg);opacity:0}
          15%{opacity:.9}
          100%{transform:translate3d(var(--sway),116vh,0) rotate(var(--spin));opacity:0}}

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
