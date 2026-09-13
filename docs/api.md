# HTTP API reference

Every public endpoint this app exposes. Base URL is your deployment's
`PUBLIC_URL` (e.g. `https://alerts.example.com`); examples below use
`https://your-domain.example`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/alerts` | `Authorization: Bearer <ingest_key>` | Fire an alert |
| `POST` | `/api/v1/alerts/<ingest_key>` | key in the path | Fire an alert |
| `GET` | `/api/overlay/<overlay_token>/events` | token in the path | SSE stream the OBS overlay consumes |
| `GET` | `/api/health` | none | Liveness probe |
| `*` | `/api/auth/*` | — | Auth.js (NextAuth) internal routes, browser sessions only |

Ingest keys (`oba_…`) and the overlay token are both created/shown in
`/dashboard/settings`. A key is stored only as a SHA-256 hash — it is
revealed once, at creation, and cannot be recovered afterwards.

---

## POST /api/v1/alerts

Renders an alert with the account's saved config for that event type and
pushes it to every overlay currently connected for that account.

Both forms run identical code (`src/lib/apiAlert.ts`); pick whichever your
calling tool makes easier:

```
POST /api/v1/alerts            Authorization: Bearer oba_XXXXXXXX
POST /api/v1/alerts/oba_XXXXXXXX
```

When the key is present in both places, the **path form wins** — the header
is only read if the path segment is empty/whitespace.

### Request

- `content-type: application/json` (the body is parsed as JSON regardless of
  the header; a non-JSON body gives `400 invalid JSON`).
- Body must be a JSON **object** (not an array, not a scalar).
- Max body size: **64 KB** (`413` above that).
- Required field on every request: `type` — one of `donation`, `follow`,
  `sub`, `raid`.

```json
{ "type": "donation", "name": "bob", "amount": 25, "currency": "USD", "message": "keep it up!" }
```

### Fields per type

Source of truth: `src/lib/eventTypes.ts`.

| Type | Required | Optional |
|---|---|---|
| `donation` | `name` (string), `amount` (number) | `currency` (string), `message` (string) |
| `follow` | `name` (string) | `message` (string) |
| `sub` | `name` (string) | `months` (number), `tier` (string), `message` (string) |
| `raid` | `name` (string) | `viewers` (number), `message` (string) |

Validation rules (`src/lib/validate.ts`):

- **Unknown keys are silently dropped.** No error — they just never reach the
  overlay or the log.
- **Absent** means `undefined`, `null`, or a whitespace-only string. Absent +
  required → `400`. Absent + optional → field omitted.
- **Number fields** accept a JSON number *or* a numeric string (`"25"` →
  `25`). Anything not finite → `400 field "amount" must be a number`.
- **String fields** accept any non-object value and are coerced with
  `String(v).trim()` (so `true` becomes `"true"`, `25` becomes `"25"`). An
  object or array value → `400 field "name" must be a string`.
- `currency` is an ISO 4217 code used to format `amount`
  (`Intl.NumberFormat`). An unrecognised code falls back to plain number
  formatting instead of failing.
- `message` is shown as the alert's own message line and is **never**
  interpolated into the template text/title — a donor message containing
  `{amount}` is displayed literally.

### Responses

| Status | Body | Meaning |
|---|---|---|
| `200` | `{"ok":true,"alertId":"<uuid>","delivered":2}` | Rendered and pushed to `delivered` connected overlays. `delivered: 0` just means no overlay was connected. |
| `202` | `{"ok":true,"delivered":0,"skipped":"disabled"}` | The event type is turned off in the dashboard. |
| `202` | `{"ok":true,"delivered":0,"skipped":"below_min_amount"}` | Donations only: `amount` is under the configured `minAmount`. |
| `400` | `{"error":"unknown event type","known":["donation","follow","sub","raid"]}` | `type` missing or not a built-in type. |
| `400` | `{"error":"field \"name\" required","type":"follow"}` | A field failed validation. |
| `400` | `{"error":"invalid JSON"}` / `{"error":"body must be a JSON object"}` | Unparseable or non-object body. |
| `401` | `{"error":"invalid ingest key"}` | Missing, unknown, or revoked key — identical body for all three, so the API is no oracle for probing keys. |
| `413` | `{"error":"body too large"}` | Body over 64 KB. |
| `429` | `{"error":"rate limit exceeded"}` | Over the limit; a `Retry-After` header (seconds) is set. |
| `500` | `{"error":"internal error"}` | Unexpected failure. Never echoes the request URL (which may carry the key). |

`alertId` is a UUID stamped onto the overlay payload so the overlay can key
its render loop. **It is not the id of the `AlertLog` row**, and there is no
endpoint to fetch an alert by it.

A failure to write the `AlertLog` row does *not* fail the request: the alert
is already on screen, and a 500 would make a retrying caller double-fire it.

### Rate limit

60 requests per 60-second **fixed** window, per ingest key
(`src/lib/ratelimit.ts`). Fixed, not sliding: ~120 requests can land across a
window boundary. Counters live in process memory — they reset on restart and
are per instance.

### Examples

```bash
# path form
curl -X POST https://your-domain.example/api/v1/alerts/oba_XXXXXXXXXXXX \
  -H 'content-type: application/json' \
  -d '{"type":"follow","name":"bob","message":"welcome!"}'

# header form
curl -X POST https://your-domain.example/api/v1/alerts \
  -H 'authorization: Bearer oba_XXXXXXXXXXXX' \
  -H 'content-type: application/json' \
  -d '{"type":"donation","name":"bob","amount":25,"currency":"USD"}'
```

n8n (HTTP Request node): method `POST`, URL `…/api/v1/alerts`, body content
type JSON, and either a header `Authorization: Bearer oba_…` or the key
appended to the URL path. Body as an expression, e.g.
`{{ { "type": "donation", "name": $json.donorName, "amount": $json.amount } }}`.

### Key handling

The path form puts a credential in the URL. Whatever sits in front of the app
must not log the request URI for that route — `deploy/nginx.conf` sets
`access_log off` on it. The app itself logs only the key's 12-character
prefix, never the key or the path.

---

## GET /api/overlay/&lt;overlay_token&gt;/events

The Server-Sent Events stream the OBS Browser Source consumes. You normally
never call this directly — you add `/overlay/<token>?w=<widget>` as a Browser
Source and its client opens this. Documented because reverse proxies need to
be configured for it.

The stream carries every widget's frames; the `?w=` on the page URL (`alerts`
or `result`) is what narrows one Browser Source to one widget. Omitting `w`
renders all of them in a single source.

- `200` with `content-type: text/event-stream`. Unknown token → `404
  {"error":"unknown overlay"}`.
- Response headers include `cache-control: no-store, no-transform` and
  `x-accel-buffering: no`.
- On connect the server sends the comment frame `: connected`, then `: ping`
  every 15 s to keep idle proxies from closing the connection.
- Alert frames are unnamed events: `data: <AlertPayload JSON>\n\n`.

`AlertPayload` (`src/lib/render.ts`):

```jsonc
{
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
}
```

Proxy requirements: `proxy_buffering off` and a long `proxy_read_timeout`.
SSE dies behind a buffering proxy, and a short read timeout drops OBS's
connection every few minutes.

Fan-out is in-process (`src/lib/hub.ts`), so an alert only reaches overlays
connected to the instance that received the POST — run a single instance.

---

## GET /api/health

```
200 {"ok":true}
```

Static — it does **not** touch the database, so it proves the process is up,
not that Postgres is reachable.

---

## /api/auth/\*

Auth.js (NextAuth v5) handles these for browser sessions (credentials login,
CSRF, session, signout). They are not part of the machine-facing API: there
is no token endpoint and no way to drive the alert API with a user session.
Use an ingest key.
