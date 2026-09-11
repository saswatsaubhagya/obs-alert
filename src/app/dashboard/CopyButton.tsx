'use client';

import { useState } from 'react';

/** One copy button for every ready-to-paste URL in the dashboard: the overlay
 *  URL and the full alert URL shown when a key is created. */
export default function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState('copied');
        } catch {
          // clipboard access can be refused (insecure origin, denied permission)
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2000);
      }}
    >
      {state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed — select it manually' : label}
    </button>
  );
}
