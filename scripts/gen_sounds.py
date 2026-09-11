#!/usr/bin/env python3
"""Renders the built-in alert sounds into public/sounds/.

Synthesised rather than sampled so the repo carries no third-party audio and
no licence to track. Run it after editing a voice; the WAVs are committed, so
this is not part of the build.

    python3 scripts/gen_sounds.py

Keep the file names in step with BUILT_IN_SOUNDS in src/lib/sounds.ts —
tests/sounds.test.ts fails if one goes missing.
"""

import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds'


def sine(t, f):
    return math.sin(2 * math.pi * f * t)


def square(t, f):
    return 1.0 if (t * f) % 1.0 < 0.5 else -1.0


def saw(t, f):
    return 2.0 * ((t * f) % 1.0) - 1.0


def render(dur, fn):
    """fn(t) -> sample in roughly [-1, 1], sampled over `dur` seconds."""
    return [fn(i / RATE) for i in range(int(dur * RATE))]


def decay(t, tau):
    return math.exp(-t / tau)


def bell(t, f, tau):
    """A struck-metal partial stack: the odd ratios are what stop it sounding
    like a plain sine beep."""
    return (
        sine(t, f) * decay(t, tau)
        + 0.5 * sine(t, f * 2.0) * decay(t, tau * 0.6)
        + 0.25 * sine(t, f * 2.76) * decay(t, tau * 0.35)
        + 0.12 * sine(t, f * 5.4) * decay(t, tau * 0.2)
    )


def note(t, start, f, tau, wave_fn=sine):
    """One voice in a sequence: silent before `start`, decaying after it."""
    if t < start:
        return 0.0
    u = t - start
    return wave_fn(u, f) * decay(u, tau)


def chime(t):
    return 0.55 * (bell(t, 880, 0.55) + 0.6 * bell(t, 1320, 0.4))


def ding(t):
    return 0.8 * bell(t, 1568, 0.28)


def coin(t):
    # The arcade two-step: a short grace note into a longer held one.
    grace, hold = 0.055, 0.055
    f = 988 if t < grace else 1319
    env = 1.0 if t < grace else decay(t - hold, 0.16)
    return 0.32 * square(t, f) * env


def blip(t):
    f = 660 + 660 * (t / 0.12)  # rising sweep
    return 0.3 * square(t, f) * decay(t, 0.05)


def whoosh(t, _rng=random.Random(7), _lp=[0.0]):
    # Band-limited noise with a swell: one-pole lowpass whose cutoff opens and
    # closes over the sound, which is all a whoosh really is.
    n = _rng.uniform(-1.0, 1.0)
    k = 0.02 + 0.35 * math.sin(math.pi * min(t / 0.6, 1.0))
    _lp[0] += k * (n - _lp[0])
    swell = math.sin(math.pi * min(t / 0.6, 1.0)) ** 2
    return 1.6 * _lp[0] * swell


def fanfare(t):
    # C5 - E5 - G5 arpeggio, sawtooth for brightness.
    return 0.3 * (
        note(t, 0.00, 523.25, 0.35, saw)
        + note(t, 0.12, 659.25, 0.35, saw)
        + note(t, 0.24, 783.99, 0.55, saw)
    )


SOUNDS = {
    'chime.wav': (1.2, chime),
    'ding.wav': (0.7, ding),
    'coin.wav': (0.5, coin),
    'blip.wav': (0.18, blip),
    'whoosh.wav': (0.7, whoosh),
    'fanfare.wav': (1.1, fanfare),
}

FADE = int(0.004 * RATE)  # 4ms edge fades: without them every clip starts and ends on a click


def write(path, samples):
    n = len(samples)
    frames = bytearray()
    for i, s in enumerate(samples):
        if i < FADE:
            s *= i / FADE
        if i > n - FADE:
            s *= (n - i) / FADE
        s = math.tanh(s)  # soft clip, so a hot voice distorts gently instead of wrapping
        frames += struct.pack('<h', int(max(-1.0, min(1.0, s)) * 32000))
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (dur, fn) in SOUNDS.items():
        path = OUT / name
        write(path, render(dur, fn))
        print(f'{path.relative_to(OUT.parent.parent)}  {path.stat().st_size // 1024}KB')


if __name__ == '__main__':
    main()
