import Link from 'next/link';
import { auth } from '@/auth';
import { BUILT_IN, EVENT_TYPE_KEYS } from '@/lib/eventTypes';
import SidePanel from '../dashboard/SidePanel';

export const metadata = { title: 'API reference — OBS Alert' };

const RESPONSES: [string, string, string][] = [
  ['200', '{"ok":true,"alertId":"<uuid>","delivered":2}', 'Rendered and pushed to that many connected overlays. 0 just means no overlay was connected.'],
  ['202', '{"ok":true,"delivered":0,"skipped":"disabled"}', 'The event type is switched off in the dashboard.'],
  ['202', '{"ok":true,"delivered":0,"skipped":"below_min_amount"}', 'Donations only: amount is under the configured minimum.'],
  ['400', '{"error":"unknown event type","known":[…]}', 'type missing or not a built-in type.'],
  ['400', '{"error":"field \\"name\\" required","type":"follow"}', 'A field failed validation.'],
  ['400', '{"error":"invalid JSON"}', 'Body was not parseable JSON, or not a JSON object.'],
  ['401', '{"error":"invalid ingest key"}', 'Missing, unknown, or revoked key — the same body for all three, so the API cannot be used to probe for valid keys.'],
  ['413', '{"error":"body too large"}', 'Body over 64KB.'],
  ['429', '{"error":"rate limit exceeded"}', '60 requests/minute per key exceeded; a Retry-After header (seconds) is set.'],
  ['500', '{"error":"internal error"}', 'Unexpected failure. Never echoes the request URL, which may carry the key.'],
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card" id={id}>
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      <div className="card-body docs-body">{children}</div>
    </section>
  );
}

export default async function ApiDocs() {
  const session = await auth();
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';

  return (
    <div className="shell">
      {session?.user ? <SidePanel overlayUrl={null} /> : null}
      <div className="shell-main">
        <main className="editor docs" style={{ maxWidth: 900 }}>
        <header className="page-head">
          <div>
            <h1>API reference</h1>
            <p className="muted">
              Everything you can call from n8n, a webhook, or curl. Your keys and overlay URL live in{' '}
              <Link href="/dashboard/settings">Settings</Link>.
            </p>
          </div>
        </header>

        <Section id="endpoints" title="Endpoints">
          <div className="docs-scroll">
            <table>
              <thead>
                <tr><th>Method</th><th>Path</th><th>Auth</th><th>Purpose</th></tr>
              </thead>
              <tbody>
                <tr><td><code>POST</code></td><td><code>/api/v1/alerts</code></td><td>Bearer key</td><td>Fire an alert</td></tr>
                <tr><td><code>POST</code></td><td><code>/api/v1/alerts/&lt;key&gt;</code></td><td>key in path</td><td>Fire an alert</td></tr>
                <tr><td><code>GET</code></td><td><code>/api/overlay/&lt;token&gt;/events</code></td><td>token in path</td><td>SSE stream the OBS overlay reads</td></tr>
                <tr><td><code>GET</code></td><td><code>/api/health</code></td><td>none</td><td>Liveness probe (does not touch the database)</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted">
            Base URL for this deployment: <code>{base}</code>
          </p>
        </Section>

        <Section id="auth" title="Authentication">
          <p>Both alert routes take the same ingest key, in whichever place is easier for your tool:</p>
          <pre>{`POST ${base}/api/v1/alerts
  Authorization: Bearer oba_XXXXXXXXXXXX

  POST ${base}/api/v1/alerts/oba_XXXXXXXXXXXX`}</pre>
          <p className="muted">
            If a key is present in both, the path wins. Keys are stored only as a hash — the full key is shown once,
            at creation, and cannot be recovered. Revoking one takes effect immediately.
          </p>
          <p className="muted">
            <strong>The path form puts a credential in the URL.</strong> Any reverse proxy in front of this app must
            not log the request URI for that route (see <code>deploy/nginx.conf</code>). The app itself logs only the
            key&apos;s 12-character prefix.
          </p>
        </Section>

        <Section id="fire" title="POST /api/v1/alerts — fire an alert">
          <p>
            JSON object body. <code>type</code> is required and picks the event type; the remaining fields depend on
            it. Max body 64KB.
          </p>
          <pre>{`curl -X POST ${base}/api/v1/alerts/oba_XXXXXXXXXXXX \\
    -H 'content-type: application/json' \\
    -d '{"type":"donation","name":"bob","amount":25,"currency":"USD","message":"keep it up!"}'`}</pre>

          <h3>Fields per type</h3>
          <div className="docs-scroll">
            <table>
              <thead>
                <tr><th><code>type</code></th><th>Required</th><th>Optional</th></tr>
              </thead>
              <tbody>
                {EVENT_TYPE_KEYS.map((key) => {
                  const fields = BUILT_IN[key].fields;
                  const cell = (req: boolean) =>
                    fields
                      .filter((f) => f.required === req)
                      .map((f) => `${f.name} (${f.type})`)
                      .join(', ') || '—';
                  return (
                    <tr key={key}>
                      <td><code>{key}</code></td>
                      <td>{cell(true)}</td>
                      <td>{cell(false)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3>Validation rules</h3>
          <ul>
            <li>Unknown keys are dropped silently — no error, they just never reach the overlay or the log.</li>
            <li>
              A field is absent if it is <code>null</code>, <code>undefined</code>, or a whitespace-only string.
              Absent + required is a 400; absent + optional is simply omitted.
            </li>
            <li>
              Number fields accept a JSON number or a numeric string (<code>&quot;25&quot;</code> → <code>25</code>);
              anything non-finite is a 400.
            </li>
            <li>String fields are trimmed and coerced; an object or array value is a 400.</li>
            <li>
              <code>currency</code> is an ISO 4217 code used to format <code>amount</code>. An unknown code falls back
              to plain number formatting rather than failing.
            </li>
            <li>
              <code>message</code> is shown on its own line and is <strong>never</strong> interpolated into the
              template — a donor message containing <code>{'{amount}'}</code> displays literally.
            </li>
          </ul>

          <h3>Responses</h3>
          <div className="docs-scroll">
            <table>
              <thead>
                <tr><th>Status</th><th>Body</th><th>Meaning</th></tr>
              </thead>
              <tbody>
                {RESPONSES.map(([status, body, meaning]) => (
                  <tr key={status + body}>
                    <td><code>{status}</code></td>
                    <td><code>{body}</code></td>
                    <td>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            <code>alertId</code> is a UUID stamped onto the overlay payload so the overlay can key its render loop. It
            is not the id of the logged row, and there is no endpoint to fetch an alert by it.
          </p>
          <p className="muted">
            Rate limit: 60 requests per 60-second fixed window, per key. Fixed rather than sliding, so ~120 can land
            across a window boundary; counters are in memory and reset on restart.
          </p>
        </Section>

        <Section id="n8n" title="n8n (HTTP Request node)">
          <ul>
            <li><strong>Method</strong>: <code>POST</code></li>
            <li><strong>URL</strong>: <code>{`${base}/api/v1/alerts`}</code> (or append your key to the path)</li>
            <li><strong>Headers</strong>: <code>Authorization: Bearer oba_…</code> — skip if using the path form</li>
            <li><strong>Body Content Type</strong>: JSON</li>
            <li>
              <strong>Body</strong> (expression):{' '}
              <code>{'{{ { "type": "donation", "name": $json.donorName, "amount": $json.amount } }}'}</code>
            </li>
          </ul>
        </Section>

        <Section id="sse" title="GET /api/overlay/&lt;token&gt;/events — the overlay stream">
          <p>
            The Server-Sent Events stream the OBS Browser Source consumes. You do not normally call it yourself; it
            is documented because reverse proxies need configuring for it.
          </p>
          <ul>
            <li><code>200</code> <code>text/event-stream</code>; unknown token → <code>404 {'{"error":"unknown overlay"}'}</code>.</li>
            <li>Sends <code>: connected</code> on open, then <code>: ping</code> every 15s to keep idle proxies from closing it.</li>
            <li>Alerts arrive as unnamed events: <code>data: &lt;payload JSON&gt;</code>.</li>
            <li>Proxies need <code>proxy_buffering off</code> and a long read timeout, or the stream dies.</li>
          </ul>
          <pre>{`{
    "id": "uuid",              // same value as the response's alertId
    "eventType": "donation",
    "title": "DONATION",       // rendered titleTemplate, "" if unset
    "text": "bob donated $25.00!",
    "message": "keep it up!",  // raw, never interpolated; "" if absent
    "style": { "accent": "#31d0aa", "bg": "…", "fg": "…", "font": "…",
               "size": 34, "pos": "top", "width": 640, "radius": 16,
               "anim": "fade" },
    "durationMs": 6000,        // clamped to 100–30000
    "imageUrl": null,
    "soundUrl": null,
    "soundVolume": 80          // 0–100
  }`}</pre>
          <p className="muted">
            Fan-out is in-process, so an alert only reaches overlays connected to the instance that received the POST
            — run a single instance.
          </p>
        </Section>
      </main>
      </div>
    </div>
  );
}
