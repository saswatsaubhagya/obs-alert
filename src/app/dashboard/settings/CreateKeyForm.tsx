'use client';

import { useActionState, useState } from 'react';
import CopyButton from '../CopyButton';
import { createKeyAction } from './actions';

export default function CreateKeyForm({ base }: { base: string }) {
  const [state, action, pending] = useActionState(createKeyAction, null);
  const [dismissed, setDismissed] = useState(false);
  const plain = dismissed ? undefined : state?.plain;
  // The ready-to-paste thing is the URL, not the key: the whole onboarding flow
  // is "paste this into n8n/curl", so show the URL the key belongs in.
  const alertUrl = plain ? `${base}/api/v1/alerts/${plain}` : undefined;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <form
        action={(formData) => {
          setDismissed(false);
          return action(formData);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input name="name" placeholder="n8n prod" style={{ maxWidth: 260 }} />
        <button type="submit" disabled={pending} style={{ whiteSpace: 'nowrap' }}>
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {plain && alertUrl && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--accent)',
            background: 'var(--accent-soft)',
            padding: 14,
            borderRadius: 10,
            display: 'grid',
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Copy this now — the key is not shown again.</p>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Alert URL (POST your JSON body here)</div>
            <code style={{ wordBreak: 'break-all' }}>{alertUrl}</code>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>
              Key on its own, if your tool sends it as <code>Authorization: Bearer …</code>
            </div>
            <code style={{ wordBreak: 'break-all' }}>{plain}</code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <CopyButton value={alertUrl} label="Copy alert URL" />
            <CopyButton value={plain} label="Copy key" />
            <button type="button" onClick={() => setDismissed(true)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
