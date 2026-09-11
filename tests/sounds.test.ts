import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SOUNDS } from '../src/lib/sounds';

// The picker offers these paths as-is to the overlay; a renamed or missing file
// is a silent no-sound alert in production, so check the assets really exist.
describe('built-in sounds', () => {
  it.each(BUILT_IN_SOUNDS.map((s) => s.value))('%s exists and is a WAV', (url) => {
    const path = join(process.cwd(), 'public', url);
    expect(existsSync(path), `${path} missing — run python3 scripts/gen_sounds.py`).toBe(true);
    const head = readFileSync(path).subarray(0, 12);
    expect(head.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(head.subarray(8, 12).toString('latin1')).toBe('WAVE');
  });
});
