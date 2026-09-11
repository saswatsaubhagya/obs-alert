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
    <main style={{ maxWidth: 760, margin: '4vh auto', display: 'grid', gap: 28 }}>
      <section>
        <h2>OBS Browser Source URL</h2>
        {overlay ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ wordBreak: 'break-all' }}>{`${base}/overlay/${overlay.token}`}</code>
              <CopyButton value={`${base}/overlay/${overlay.token}`} label="Copy overlay URL" />
            </div>
            <p>Width 1920, Height 1080. Tick &quot;Control audio via OBS&quot; so alert sounds reach the stream.</p>
            <form action={rotateTokenAction}>
              <button>Rotate overlay token</button>
            </form>
            <p>Rotating breaks the URL currently in OBS — you will need to paste the new one.</p>
          </>
        ) : (
          <p>No overlay has been set up for this account yet — contact support to have one created.</p>
        )}
      </section>

      <section>
        <h2>Ingest keys</h2>
        <CreateKeyForm base={base} />
        <p>
          The full alert URL — the one with the key in it — is shown once, immediately after creation. Copy it
          into your workflow tool then; it cannot be shown again.
        </p>
        <ul>
          {keys.map((k) => (
            <li key={k.id}>
              <strong>{k.name}</strong> <code>{k.prefix}…</code>{' '}
              {k.revokedAt ? (
                <em>revoked</em>
              ) : (
                <form action={revokeKeyAction} style={{ display: 'inline' }}>
                  <input type="hidden" name="keyId" value={k.id} />
                  <button>Revoke</button>
                </form>
              )}
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                POST to <code>{`${base}/api/v1/alerts/`}</code>
                followed by this key — the full URL was shown when the key was created and is not recoverable
                here, because only a hash of the key is stored.
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
