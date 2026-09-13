'use client';

import { useState } from 'react';

/** Masks a write credential (the control dock URL) by default, on a page a
 *  streamer opens while streaming. The overlay URL above it is read-only and
 *  can be shown in the clear; a write credential cannot, so it stays hidden
 *  until an explicit click reveals it. CopyButton alongside this still copies
 *  the real value regardless of whether it is currently shown. */
export default function MaskedSecret({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      <code style={{ wordBreak: 'break-all' }}>{revealed ? value : '•'.repeat(24)}</code>
      <button type="button" onClick={() => setRevealed((r) => !r)}>
        {revealed ? 'Hide' : 'Show'}
      </button>
    </>
  );
}
