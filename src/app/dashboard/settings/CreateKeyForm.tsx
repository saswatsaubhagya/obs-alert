'use client';

import { useActionState, useState } from 'react';
import { createKeyAction } from './actions';

export default function CreateKeyForm() {
  const [state, action, pending] = useActionState(createKeyAction, null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const plain = dismissed ? undefined : state?.plain;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <form
        action={(formData) => {
          setDismissed(false);
          setCopied(false);
          return action(formData);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input name="name" placeholder="n8n prod" />
        <button disabled={pending}>Create key</button>
      </form>

      {plain && (
        <div
          role="alert"
          style={{ border: '1px solid #444', padding: 12, borderRadius: 6, display: 'grid', gap: 8 }}
        >
          <p style={{ margin: 0 }}>
            Copy this key now — it will not be shown again.
          </p>
          <code style={{ wordBreak: 'break-all' }}>{plain}</code>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(plain);
                setCopied(true);
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button type="button" onClick={() => setDismissed(true)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
