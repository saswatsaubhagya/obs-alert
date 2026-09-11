/** The alert sounds shipped with the app, served straight out of `public/`.
 *  Synthesised by `scripts/gen_sounds.py` — regenerate there, not by hand, and
 *  keep this list in step with the files (tests/sounds.test.ts checks it). */
export const BUILT_IN_SOUNDS = [
  { value: '/sounds/chime.wav', label: 'Chime' },
  { value: '/sounds/ding.wav', label: 'Ding' },
  { value: '/sounds/coin.wav', label: 'Coin' },
  { value: '/sounds/blip.wav', label: 'Blip' },
  { value: '/sounds/whoosh.wav', label: 'Whoosh' },
  { value: '/sounds/fanfare.wav', label: 'Fanfare' },
] as const;

export function isBuiltInSound(url: string): boolean {
  return BUILT_IN_SOUNDS.some((s) => s.value === url);
}
