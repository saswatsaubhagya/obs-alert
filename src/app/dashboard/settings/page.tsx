import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
import CopyButton from '../CopyButton';
import { revokeKeyAction, rotateTokenAction } from './actions';
import CreateKeyForm from './CreateKeyForm';

export default async function Settings() {
  const userId = await requireUserId();
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  const overlay = await prisma.overlay.findFirst({ where: { userId } });
  const keys = await prisma.ingestKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

  return (
    <main className="editor" style={{ maxWidth: 820 }}>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">The overlay URL OBS reads from, and the keys your tools post alerts with.</p>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>OBS Browser Source URL</h2>
        </div>
        <div className="card-body" style={{ gap: 12, paddingBottom: 18, paddingTop: 16 }}>
        {overlay ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ wordBreak: 'break-all' }}>{`${base}/overlay/${overlay.token}`}</code>
              <CopyButton value={`${base}/overlay/${overlay.token}`} label="Copy overlay URL" />
            </div>
            <p className="muted">
              Width 1920, Height 1080. Tick &quot;Control audio via OBS&quot; so alert sounds reach the stream.
            </p>
            <form action={rotateTokenAction}>
              <button>Rotate overlay token</button>
            </form>
            <p className="muted">Rotating breaks the URL currently in OBS — you will need to paste the new one.</p>
          </>
        ) : (
          <p className="muted">No overlay has been set up for this account yet — contact support to have one created.</p>
        )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ingest keys</h2>
        </div>
        <div className="card-body" style={{ gap: 12, paddingBottom: 18, paddingTop: 16 }}>
        <CreateKeyForm base={base} />
        <p className="muted">
          The full alert URL — the one with the key in it — is shown once, immediately after creation. Copy it
          into your workflow tool then; it cannot be shown again.
        </p>
        <ul style={{ display: 'grid', gap: 10, listStyle: 'none' }}>
          {keys.map((k) => (
            <li
              key={k.id}
              style={{
                display: 'grid',
                gap: 6,
                padding: 12,
                border: '1px solid var(--line)',
                borderRadius: 10,
                background: 'var(--bg-input)',
                opacity: k.revokedAt ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{k.name}</strong>
                <code>{k.prefix}…</code>
                <span style={{ flex: 1 }} />
                {k.revokedAt ? (
                  <em className="muted">revoked</em>
                ) : (
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="keyId" value={k.id} />
                    <button>Revoke</button>
                  </form>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                POST to <code>{`${base}/api/v1/alerts/`}</code>
                followed by this key — the full URL was shown when the key was created and is not recoverable
                here, because only a hash of the key is stored.
              </div>
            </li>
          ))}
        </ul>
        </div>
      </section>
    </main>
  );
}
