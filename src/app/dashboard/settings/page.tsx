import { requireUserId } from '@/auth';
import prisma from '@/lib/db';
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
        <code>{`${base}/overlay/${overlay?.token}`}</code>
        <p>Width 1920, Height 1080. Tick &quot;Control audio via OBS&quot; so alert sounds reach the stream.</p>
        <form action={rotateTokenAction}>
          <button>Rotate overlay token</button>
        </form>
        <p>Rotating breaks the URL currently in OBS — you will need to paste the new one.</p>
      </section>

      <section>
        <h2>Ingest keys</h2>
        <CreateKeyForm />
        <p>The full key is shown once, immediately after creation. Store it in your workflow tool.</p>
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
              <div>
                POST <code>{`${base}/api/v1/alerts/<your key>`}</code>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
