# OBS Alert Platform — Design (Sub-project 1: Vertical Slice)

Date: 2026-09-10
Status: Approved for planning

## Purpose

A multi-tenant platform where streamers receive stream alerts (donations, follows,
subs, raids) as an OBS overlay. Any client can fire an alert through a documented
HTTP API — n8n, Zapier/Make, a custom backend, or curl — and the dashboard can fire
one manually. Streamers customize each alert type's wording and look, and see the
result in a live preview that is the real overlay.

## Scope

### In scope (this spec)

- Email + password auth, sessions.
- Public alert API: `POST /api/v1/alerts`, bearer-key authenticated, multiple named
  revocable keys per user.
- Four built-in event types: `donation`, `follow`, `sub`, `raid`.
- Per-event-type customization: message template with variables, title template,
  style tokens (colors, font, size, position, width, radius, animation), duration,
  image URL, sound URL + volume, and a `minAmount` filter for donations.
- Overlay page + SSE endpoint keyed by a read-only overlay token, with a serial
  alert queue.
- Dashboard: event-type editor, live preview, test fire, manual send form, API key
  management, overlay URL, token rotation.
- Alert log (raw payload + rendered text) as the debugging surface.

### Explicitly deferred

Billing and paid tiers; usage quotas; user-defined custom event types; a hosted
sound/image library; moderation and blocklists; alert history UI; per-tier
donation styling; alert cooldowns; multiple overlays/scenes per user; horizontal
scaling (multi-instance).

### Decisions reversed during brainstorming

The ingest endpoint was initially designed as a per-user secret key in the URL
path. It became `Authorization: Bearer` header auth on a versioned route once the
scope clarified that this is a public API for arbitrary clients, not a private
endpoint for the author's own n8n instance. Header auth is the conventional shape
for a documented API and keeps keys out of proxy logs.

## Stack

- Next.js (App Router), self-hosted on a long-running Node process (Fly.io or a
  VPS). Not serverless: the overlay needs a persistent SSE connection, which
  serverless response-duration limits break.
- Postgres + Prisma.
- Auth.js (NextAuth) with the Credentials provider and the Prisma adapter.
- Vitest for tests.

## Architecture

```
  n8n  |  Zapier/Make  |  curl/custom backend  |  Dashboard "Send alert" panel
   +--------+---------------+------------------+-----------+
                                           |
        POST /api/v1/alerts                |   dashboard uses the same code path,
        Authorization: Bearer <api_key>    |   authenticated by session not api_key
        { "type":"donation", "name":"bob",
          "amount":500, "currency":"INR", "message":"gg" }
                              |
                    +---------v----------+
                    | Next.js (self-host)|
                    | sendAlert(userId,  |   Postgres / Prisma
                    |           payload) |<-- EventType schema
                    |  1 validate vs     |    AlertConfig (template + style)
                    |    type schema     |    ApiKey, AlertLog
                    |  2 render template |
                    |  3 persist AlertLog|
                    |  4 hub.publish     |
                    +---------+----------+
                              | in-process SSE hub  Map<userId, Set<res>>
                              v
        GET /api/overlay/<overlay_token>/events   <- OBS Browser Source
                              |
                    /overlay/<overlay_token>   (queue + animate, text nodes only)
```

### Core invariants

1. **One core function, three entrances.** `sendAlert(userId, payload, source)` is
   the only code that validates, renders, logs, and publishes. The API route
   resolves an api_key to a userId; the dashboard route resolves a session to a
   userId; test fire calls it with `source: 'test'`. No entrance can skip
   validation.
2. **The server renders; the overlay displays.** Template interpolation and
   currency formatting happen server-side. The overlay receives a finished
   `{ title, text, message, style, durationMs, imageUrl, soundUrl }` payload. So
   template edits need no overlay reload, and no user-supplied data is
   interpolated in the browser.
3. **Rendered output is data, never markup.** The overlay writes every value with
   `textContent`. Donor-controlled text (`name`, `message`) cannot become markup on
   any path.
4. **Two separate secrets.** `api_key` (client -> platform, write) and
   `overlay_token` (platform -> OBS, read-only stream). A leaked overlay token
   cannot fire alerts. Both are rotatable from the dashboard.
5. **One schema, two validators.** An event type's field list drives both the API
   validator and the generated dashboard send form, so a manual send cannot produce
   a shape the API would reject.

### Known ceiling

The SSE hub and the rate limiter are in-process, so the system runs as a single
instance. The upgrade path is Redis pub/sub for the hub and a Redis token bucket
for the limiter. This is a deliberate simplification, not an oversight; it is
marked in code with a `ponytail:` comment naming the ceiling.

## Existing code

The repository currently holds a zero-dependency prototype: `server.js`
(validate / SSE broadcast / HTTP routes), `overlay.html` (queue, animation, theme
tokens, URL overrides), `test.js`, `README.md`.

- `server.js` validation and broadcast logic ports into `sendAlert` and the SSE hub
  module.
- `overlay.html` becomes the overlay page template; its queue, animation, and
  reconnect behavior are kept.
- `test.js` cases port into the Vitest suite.
- `README.md` is rewritten for the platform (OBS Browser Source setup instructions
  remain accurate and are kept).

## Data model

```prisma
User          id, email (unique), passwordHash, createdAt
Session       // Auth.js Prisma adapter tables: Session, Account, VerificationToken

Overlay       id, userId, token (unique, 32 random bytes), name, createdAt
              // one per user in this phase; a table rather than a column so
              // multiple overlays/scenes need no migration later

ApiKey        id, userId, name, hash, prefix, lastUsedAt, revokedAt, createdAt
              // plaintext shown once at creation, never stored

EventType     key, label, fields Json
              // GLOBAL rows (no userId), seeded: donation, follow, sub, raid
              // fields: [{ name, type: "string"|"number", required: bool }]

AlertConfig   id, userId, eventTypeKey, enabled,
              template, titleTemplate?, style Json, durationMs,
              imageUrl?, soundUrl?, soundVolume, minAmount?, locale
              @@unique([userId, eventTypeKey])

AlertLog      id, userId, eventTypeKey, payload Json, renderedText,
              source ("api" | "dashboard" | "test"), deliveredTo Int, createdAt
```

Notes:

- `EventType` is a table, not a TypeScript enum, so phase 2 adds a nullable
  `userId` for user-defined types without migrating existing configs.
- `AlertConfig` rows are created lazily on first save. A missing row means built-in
  defaults, so a new signup's alerts work before they open the editor.
- API keys are hashed with sha256 rather than a slow KDF: keys are high-entropy
  random values, not human passwords, and key auth is on the hot path. `prefix` is
  stored in plaintext so the dashboard can identify a key (`oba_live_7f3a...`).
- `AlertLog` is the answer to "my workflow fired but nothing appeared." It needs a
  retention cap (delete rows older than 30 days) or it grows without bound.

## Template rendering

```
template  "{name} donated {amount}!"
payload   { name: "bob", amount: 500, currency: "INR", message: "gg" }
          -> replace {var} from the payload; an unknown var renders as empty string
          -> amount formatted with Intl.NumberFormat(config.locale, {
             style: 'currency', currency: payload.currency })
result    { id, title: "DONATION", text: "bob donated INR 500.00!",
            message: "gg", style, durationMs, imageUrl, soundUrl }
```

- Available variables are exactly the event type's declared fields, shown in the
  editor as clickable chips. A template is find-and-replace over a flat map: no
  expressions, no logic, no nesting.
- Currency formatting takes the currency code from the payload and the locale from
  `AlertConfig.locale` (default `en-US`), so a streamer controls digit grouping and
  symbol placement while each alert carries its own currency. A payload with an
  `amount` but no `currency` renders the bare number.
- `message` travels as its own payload field rather than being interpolated into
  `text`, so the streamer can style or disable the donor's free text separately and
  it never joins a string that might be treated as markup.

## Dashboard

- `/dashboard` — event type list with enable toggles on the left; the selected
  type's editor on the right (templates, style controls, duration, image and sound
  URL, `minAmount`).
- Live preview is the real overlay page in a same-origin iframe, updated via
  `postMessage`. "Test fire" calls `sendAlert(..., source: 'test')`, so it travels
  the real pipeline to the real overlay in OBS.
- `/dashboard/settings` — overlay URL with copy button, overlay token rotation, API
  key create / name / revoke.
- Send-alert panel — a form generated from the selected event type's `fields`,
  posted to the dashboard route.

## Overlay

- `/overlay/<token>` opens an `EventSource` against
  `/api/overlay/<token>/events` and reconnects automatically.
- Serial queue: one alert on screen at a time, the next starting after the previous
  finishes. The queue is capped at 50, dropping the oldest beyond that so a burst
  cannot wedge the overlay.
- Animation presets: fade, slide, pop. Enter, hold `durationMs`, exit.
- Sound plays on show. OBS requires "Control audio via OBS" on the Browser Source
  for alert audio to reach the stream mix.
- Style arrives per-alert in the payload, so different event types can look
  entirely different on a single Browser Source. Query-string theme overrides
  remain as an escape hatch.

## API contract

`POST /api/v1/alerts`, `Authorization: Bearer <api_key>`, JSON body.

| Case | Response |
|---|---|
| valid | `200 {ok:true, alertId, delivered:N}` — `delivered:0` means no overlay is connected (the alert is still logged) |
| missing or invalid bearer key | `401 {error:"invalid api key"}` |
| revoked key | `401`, same body — no hint that the key once existed |
| unknown `type` | `400 {error:"unknown event type", known:[...]}` |
| missing required field | `400 {error:"field \"amount\" required", type:"donation"}` |
| event type disabled by the user | `202 {ok:true, delivered:0, skipped:"disabled"}` |
| below `minAmount` | `202 {ok:true, delivered:0, skipped:"below_min_amount"}` |
| body over 64KB | `413 {error:"body too large"}` |
| rate limit exceeded | `429` with `Retry-After` |

The skip cases return `202` rather than `200` or an error: the caller did nothing
wrong and must not retry, but "nothing appeared on stream" needs a
distinguishable, debuggable answer. Error bodies are specific enough to diagnose
from a workflow tool's execution log.

## Security

- Passwords hashed with argon2id (bcrypt cost 12 acceptable).
- Rate limit per API key, roughly 60 alerts per minute, as an in-memory token
  bucket. Same single-instance ceiling as the SSE hub.
- The overlay token necessarily appears in a URL, since OBS loads it as a page. It
  is therefore read-only, rotatable, and grants nothing beyond a stream of alerts
  that are already visible on stream.
- The overlay page uses no session cookie and has no CSRF surface. Framing is
  permitted same-origin only, for the dashboard preview iframe.
- Input validated at both trust boundaries — the API body and the dashboard form —
  through the shared event type schema.
- `DATABASE_URL` and `AUTH_SECRET` come from the environment; `.env` is gitignored.

## Testing

- `sendAlert` unit tests: the validation table, template rendering (missing
  variable, currency formatting, donor text containing `<script>`), and each skip
  case.
- SSE hub: subscribe, publish, frame received, disconnect cleans up its entry.
- Auth: signup, login, session; API key create, authenticate, revoke, then 401.
- One end-to-end test: `POST /api/v1/alerts` with a real key, asserting an SSE
  client receives the rendered payload.
- Vitest, against a Postgres test database (Docker or a `_test` schema).

## Deployment

Dockerfile; Fly.io or a VPS behind Caddy or nginx. TLS terminates at the proxy,
which must set `proxy_buffering off` for the SSE route. Prisma migrations run on
boot. Postgres is managed (Neon, Fly Postgres) or on the same host.

## Success criteria

1. A new user signs up, copies the overlay URL into an OBS Browser Source, creates
   an API key, and fires a donation alert with curl — it appears on stream.
2. Editing the donation template and colors in the dashboard changes the next
   alert, with no overlay reload.
3. A donor `name` of `<script>alert(1)</script>` renders as literal text.
4. Two users' alerts never reach each other's overlays.
5. Ten alerts fired at once play in sequence, none lost, none overlapping.
