import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 620, margin: '14vh auto', padding: '0 24px', display: 'grid', gap: 24 }}>
      <div style={{ display: 'grid', gap: 14 }}>
        <span className="chip" style={{ justifySelf: 'start' }}>
          POST → on-stream
        </span>
        <h1 style={{ fontSize: 40, lineHeight: 1.1 }}>OBS Alert Platform</h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>
          Turn an HTTP request — from n8n, Zapier, a chatbot, a donation processor, anything that can POST JSON —
          into an on-stream alert in OBS. Sign in to get an overlay URL to paste into an OBS Browser Source and an
          ingest key to point your automation at, then design the donation, follow, sub and raid alerts in the
          dashboard with a live preview.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Link href="/signup" className="btn-primary" style={{ padding: '10px 18px', borderRadius: 8, color: '#fff' }}>
          Create an account
        </Link>
        <Link href="/login" style={{ padding: '10px 18px' }}>
          Log in
        </Link>
        <Link href="/docs" className="muted" style={{ padding: '10px 18px' }}>
          API docs
        </Link>
      </div>
    </main>
  );
}
