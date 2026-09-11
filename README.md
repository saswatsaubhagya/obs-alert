# OBS Alert Platform

A small multi-user service that turns an HTTP request (from n8n, a chatbot,
a donation processor, anything that can POST JSON) into an on-stream alert
in OBS. You sign in, get an overlay URL and one or more ingest keys, add the
overlay as an OBS Browser Source, and point whatever triggers your alerts at
the ingest API.

It replaces an earlier zero-dependency Node prototype (`server.js` +
`overlay.html`) that ran alerts for a single local OBS instance with no
accounts. That prototype's behaviour — the alert queue, the OBS Browser
Source settings, the payload shape — has been fully absorbed into this app
and the prototype has been removed from the repo.

## What you get

- Email/password accounts (argon2id password hashes, JWT sessions).
- One overlay URL per account (`/overlay/<token>`) that you add to OBS once.
- One or more named, revocable ingest keys per account, for use in n8n, a
  webhook, curl, whatever fires the alert.
- Four built-in alert types (donation, follow, sub, raid) with a dashboard
  editor for the template text, title, colors/position/animation, duration,
  image, and sound — live-previewed in the browser before you touch OBS.
- A log of the last 30 days of alerts per account (raw payload + rendered
  text), pruned automatically.

## Local setup

Requirements: Node 22+, Docker (for local Postgres).

```bash
npm install
docker compose up -d          # starts Postgres on localhost:5433
cp .env.example .env           # DATABASE_URL/PUBLIC_URL already match this compose setup — just set AUTH_SECRET
npm run db:migrate             # applies prisma/migrations to create the schema
npm run db:seed                # seeds the EventType table (informational — see note below)
npm run dev
```

`.env.example`'s `DATABASE_URL` and `PUBLIC_URL` already point at the local
Docker Postgres and `http://localhost:3000`, so nothing to change there for
local dev. Generate a real `AUTH_SECRET` rather than using the placeholder
text and put it in `.env`:

```bash
openssl rand -base64 32
```

`npm run db:seed` populates the `EventType` table for reference/future use;
the app itself currently reads the four built-in types' fields and defaults
directly from `src/lib/eventTypes.ts` at runtime, not from that table, so
skipping the seed step does not break anything.

Open `http://localhost:3000/signup`, create an account, then
`http://localhost:3000/dashboard/settings` to get your overlay URL and
create an ingest key. (See **Development** at the end of this file for
running the test suite, type-checking, and building.)

## Add the overlay to OBS (once per account)

1. Copy the overlay URL from **Settings** (`/overlay/<token>`).
2. OBS → **Sources** → **+** → **Browser**.
3. **URL**: the overlay URL from step 1.
4. **Width** `1920`, **Height** `1080`.
5. Tick **Control audio via OBS** — without it, alert sounds never reach the
   stream mix.
6. Leave **Shutdown source when not visible** *unticked*, so the overlay
   stays connected to the alert stream even when the source isn't on the
   active scene.

The overlay itself is transparent; position/scale the source however you
like. It reconnects on its own if the server restarts or the connection
drops.

## Firing an alert

`POST` a JSON body describing the event to either of these, using the
ingest key from Settings:

```
POST /api/v1/alerts/<ingest_key>
POST /api/v1/alerts            (with header: Authorization: Bearer <ingest_key>)
```

Both routes run identical logic — the key can travel in the URL path or in
the header. Use whichever your calling tool makes easier.

### curl

```bash
curl -X POST https://your-domain.example/api/v1/alerts/oba_XXXXXXXXXXXXXXXXXXXX \
  -H 'content-type: application/json' \
  -d '{"type":"follow","name":"bob","message":"welcome!"}'
```

### n8n (HTTP Request node)

- **Method**: `POST`
- **URL**: `https://your-domain.example/api/v1/alerts` (or append the key to
  the path form instead)
- **Authentication**: none, with a header
  `Authorization: Bearer oba_XXXXXXXXXXXXXXXXXXXX` added under **Headers**
  — or skip the header entirely and use the path form above.
- **Body Content Type**: JSON
- **Body**: an expression building the event object, e.g.
  `{{ { "type": "donation", "name": $json.donorName, "amount": $json.amount } }}`

### Response

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ ok: true, alertId, delivered }` | Alert accepted, rendered, and pushed to `delivered` connected overlays. |
| `202` | `{ ok: true, delivered: 0, skipped: "disabled" \| "below_min_amount" }` | Accepted but intentionally not shown — the event type is disabled, or (donations only) the amount is under your configured minimum. |
| `400` | `{ error, type?, known? }` | Unknown `type`, or a field failed validation. |
| `401` | `{ error: "invalid ingest key" }` | Missing, unknown, or revoked key. Identical for all three cases — the API gives no signal that would let someone probe for a valid key. |
| `413` | `{ error: "body too large" }` | Body over 64KB. |
| `429` | `{ error: "rate limit exceeded" }` | Over 60 requests/minute for this key; a `Retry-After` header (seconds) is set. |

**`alertId` is a UUID stamped onto the rendered overlay payload — it is not
the id of the row this alert is logged under.** It exists so an overlay can
key `key={alert.id}` in its render loop, not so you can look the alert up
later. There is currently no endpoint to fetch a single logged alert by id.

## Event types and their fields

Built-in types and their fields live in `src/lib/eventTypes.ts`. Fields not
listed below are silently dropped from the payload; a `message` field is
accepted on every type as free text shown as the alert's message line (it is
never interpolated into the template text/title, so it is safe to contain
`{amount}`-style text without triggering substitution).

| Type | `type` value | Fields |
|---|---|---|
| Donation | `donation` | `name` (string, **required**), `amount` (number, **required**), `currency` (string, optional — an ISO 4217 code used to format `amount`, e.g. `USD`), `message` (string, optional) |
| Follow | `follow` | `name` (string, **required**), `message` (string, optional) |
| Subscription | `sub` | `name` (string, **required**), `months` (number, optional), `tier` (string, optional), `message` (string, optional) |
| Raid | `raid` | `name` (string, **required**), `viewers` (number, optional), `message` (string, optional) |

Each type's template text, title, colors, duration, image, and sound are
configured per-account in the dashboard (`/dashboard`) and fall back to
built-in defaults until you save your own. A donation's `minAmount` (set in
the dashboard) is the only field-driven skip rule — everything else either
shows or is disabled outright.

## Deployment

- **`Dockerfile`** builds the app (`npx prisma generate && npm run build`)
  on `node:22-slim` and, on start, runs `npx prisma migrate deploy` before
  `npm start`. This was built and run end-to-end against the local Postgres
  from `docker compose up -d`: `prisma migrate deploy` applied cleanly,
  `@node-rs/argon2` hashed and verified a password (its native binary
  resolves fine on this base image — no separate build step needed), and a
  request that hits the database (an ingest call with a bad key) returned
  the expected `401` rather than crashing. The build logs a
  `Prisma failed to detect the libssl/openssl version` warning on this base
  image; it did not affect any of the above and can be ignored, or silenced
  by installing `openssl` in the image if it bothers you.
- **`deploy/nginx.conf`** is a drop-in `location` block set for a reverse
  proxy in front of the app. Two things in it matter and are easy to get
  wrong if you write your own proxy config instead:
  - **The ingest key travels in the URL path** (`/api/v1/alerts/<key>`), so
    that route must have **`access_log off`** (or an equivalent
    log-format override) — logging the URI logs the key.
  - **The overlay's SSE stream** (`/api/overlay/<token>/events`) needs
    **`proxy_buffering off`** and a long `proxy_read_timeout` — SSE dies
    behind a buffering proxy, and a short timeout will drop OBS's
    connection every few minutes.
- **The app must run as a single, long-lived Node process.** Do not run it
  behind a load balancer with more than one instance and do not run it as
  short-lived serverless invocations — see **Limitations** below for why.

Environment variables (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET`,
`PUBLIC_URL` (used to build the overlay URL and the `/api/v1/alerts` URL
shown in the dashboard — set it to your public domain in production).
`TEST_DATABASE_URL` is used by the test suite only (see **Development**).

You do **not** need `AUTH_TRUST_HOST` or `AUTH_URL`. `src/auth.ts` sets
`trustHost: true`, which is the right setting for a self-hosted app behind a
trusted reverse proxy: Auth.js otherwise defaults it to false whenever
`NODE_ENV=production` (as the Docker image sets it) and rejects every
`/api/auth/*` request — and therefore every login — as `UntrustedHost`. The
corollary is that whatever terminates TLS in front of the app must set
`Host`/`X-Forwarded-Host` itself and not pass a client-supplied value
through; `deploy/nginx.conf` does.

## Log retention

`AlertLog` rows (the raw payload + rendered text for each alert, kept for
dashboard/debugging visibility) are pruned automatically: `src/instrumentation.ts`
runs `pruneAlertLogs()` once, 60 seconds after boot, then once every 24
hours for as long as the process stays up. The default window is 30 days;
rows are deleted only once `createdAt` falls *strictly before* `now - 30d`,
so nothing inside the window is ever touched. `pruneAlertLogs(days)` also
exists as a plain function if you want to run it by hand (`tsx` a one-off
script, or a REPL) with a different window.

## Limitations

These are deliberate trade-offs for a single-streamer / small-scale
deployment, not bugs. Read this before you hit them by surprise.

- **Single instance only.** The SSE hub (which overlay is connected to
  which account) and the rate limiter both live in in-process `Map`s.
  Running two instances behind a load balancer means an alert only reaches
  the overlays connected to *the instance that received the request*, and
  each instance enforces its own 60/minute limit independently (so two
  instances effectively allow ~120/minute). The documented upgrade path is
  Redis pub/sub for the hub and a Redis-backed token bucket for the limiter
  — neither is implemented.
- **The rate limiter is a fixed window, not sliding.** A caller can send 60
  requests in the last instant of one 60-second window and another 60 in
  the first instant of the next window — roughly double the nominal rate
  across a window boundary. This is intentional simplicity, not a bug to
  file.
- **A donor's `message` cannot be hidden from the overlay from the
  dashboard.** There is no show/hide toggle for the message line; suppressing
  it today means editing the alert's style/template, not flipping a switch.
- **The ingest key travels in the URL path** for the path form of the API.
  This is why proxy/server logs for that route must not record the request
  URI (see **Deployment** above) — treat it the same as you would a
  password in a query string.
- **JavaScript is required** to use the dashboard's "create ingest key"
  form — it's a client component (clipboard copy, one-time reveal), and
  there is no no-JS fallback.

## Development

The test suite runs against a **separate database**, created once:

```bash
docker compose exec -T db psql -U postgres -c 'CREATE DATABASE obsalert_test'
npm run db:test:deploy        # applies prisma/migrations to the test database
```

`tests/helpers/env.ts` points the Prisma client at `TEST_DATABASE_URL`,
defaulting to `DATABASE_URL` with `_test` appended to the database name, and
**refuses to run if the two resolve to the same URL** — `resetDb()` truncates
`User` and every child table, so pointing the suite at your development
database would wipe the account, keys and alert configs you just set up.

```bash
npm test              # 20 files, 114 tests
npx tsc --noEmit
npm run lint
npm run build
```

Notable files:

- `src/lib/sendAlert.ts` — the one function every alert (API, dashboard
  test-fire, dashboard manual send) goes through: validates, checks
  enabled/minAmount, renders, publishes to the SSE hub, logs.
- `src/lib/apiAlert.ts` — the public API's request handling (auth, rate
  limit, body-size cap, JSON parsing) around `sendAlert`.
- `src/proxy.ts` — the auth guard for `/dashboard/*`. Named `proxy.ts`
  rather than the conventional `middleware.ts` because on this Next.js
  version (16.3.4) a file named `middleware.ts` is bundled as Edge
  Middleware, and Edge cannot load `@node-rs/argon2`'s native module. Do not
  rename it back — password auth breaks under Edge.
- `src/lib/retention.ts`, `src/instrumentation.ts` — see **Log retention**.
- `src/lib/eventTypes.ts` — the source of truth for the four built-in event
  types and their fields.
- `src/lib/template.ts` — the rendering contract (`renderTemplate`,
  `formatValue`, the `message` exclusion, the duration clamp), deliberately
  free of Node built-ins so `src/lib/render.ts` on the server and the
  dashboard's live preview in the browser share one copy of it.
