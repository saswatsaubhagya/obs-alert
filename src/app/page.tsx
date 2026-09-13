import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

const STEPS = [
  {
    step: 'STEP 01',
    title: 'Paste one URL into OBS',
    body: 'Every widget gets its own overlay URL. Drop it into an OBS Browser Source — no plugin, no local software, no restart.',
  },
  {
    step: 'STEP 02',
    title: 'Point your automation at the key',
    body: 'n8n, Zapier, a chatbot, a donation processor, curl — anything that can POST JSON to an HTTP endpoint with a bearer key.',
  },
  {
    step: 'STEP 03',
    title: 'Design it in the dashboard',
    body: 'Colours, sounds, duration and animation per event type, with a live preview of the exact overlay your viewers will see.',
  },
];

const WIDGETS = [
  { title: 'Alerts', body: 'Donation, follow, sub and raid alerts, each with its own styling and sound.' },
  { title: 'Win / Loss', body: 'Fire a win or loss animation from the control dock or the API.' },
  { title: 'Scoreboard', body: 'A server-held tally that survives refreshes and scene switches.' },
  { title: 'Timer', body: 'Server-held countdown, driven from the dock so the overlay stays in sync.' },
  { title: 'Socials', body: 'A rotating handle bar for the platforms you actually stream to.' },
];

export default async function Home() {
  if (await auth()) redirect('/dashboard');

  return (
    <main className="landing">
      <section className="landing-hero">
        <div style={{ display: 'grid', gap: 18 }}>
          <span className="chip" style={{ justifySelf: 'start' }}>
            POST → on-stream
          </span>
          <h1>Stream alerts driven by your own automations.</h1>
          <p className="landing-lede">
            OBS Alert Platform turns an HTTP request into an on-stream overlay. Sign in for an overlay URL to paste
            into an OBS Browser Source and an ingest key to point your tooling at — then design every alert in the
            dashboard with a live preview.
          </p>
          <div className="landing-cta">
            <Link href="/signup" className="btn-primary">
              Create an account
            </Link>
            <Link href="/login" className="btn-ghost">
              Log in
            </Link>
            <Link href="/docs" className="muted" style={{ padding: '11px 8px' }}>
              Read the API docs →
            </Link>
          </div>
        </div>

        <div className="panel landing-code">
          <header>POST /api/v1/alerts</header>
          <pre>{`curl -X POST https://…/api/v1/alerts \\
  -H 'authorization: Bearer oba_XXXXXXXXXXXX' \\
  -H 'content-type: application/json' \\
  -d '{
    "type": "donation",
    "name": "bob",
    "amount": 25,
    "currency": "USD",
    "message": "keep it up!"
  }'`}</pre>
        </div>
      </section>

      <section className="landing-section">
        <h2>How it works</h2>
        <div className="landing-grid">
          {STEPS.map((s) => (
            <div key={s.step} className="panel landing-card">
              <span className="landing-step">{s.step}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2>Widgets</h2>
        <div className="landing-grid">
          {WIDGETS.map((w) => (
            <div key={w.title} className="panel landing-card">
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-foot">
        <span className="muted">OBS Alert Platform</span>
        <span style={{ display: 'flex', gap: 18 }}>
          <Link href="/docs" className="muted">
            API docs
          </Link>
          <Link href="/login" className="muted">
            Log in
          </Link>
        </span>
      </footer>
    </main>
  );
}
