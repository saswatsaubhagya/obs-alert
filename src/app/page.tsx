import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '10vh auto', padding: '0 24px', display: 'grid', gap: 20 }}>
      <h1 style={{ margin: 0 }}>OBS Alert Platform</h1>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        Turn an HTTP request — from n8n, Zapier, a chatbot, a donation processor, anything that can POST JSON —
        into an on-stream alert in OBS. Sign in to get an overlay URL to paste into an OBS Browser Source and an
        ingest key to point your automation at, then design the donation, follow, sub and raid alerts in the
        dashboard with a live preview.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/login">Log in</Link>
        <Link href="/signup">Create an account</Link>
      </div>
    </main>
  );
}
