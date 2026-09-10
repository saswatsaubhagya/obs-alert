# OBS Alerts

Fire an HTTP request, an alert shows up on stream. Zero dependencies — just Node.

```bash
node server.js
```

## Add the Browser Source (once)

1. OBS → **Sources** → **+** → **Browser**
2. **URL**: `http://127.0.0.1:7373/overlay`
3. **Width** `1920`, **Height** `1080`
4. Tick **Control audio via OBS** — without it, alert sounds never reach the stream mix
5. Leave **Shutdown source when not visible** *unticked*, so the overlay stays connected

Position it wherever; the overlay itself is transparent.

## Fire an alert

```bash
curl -X POST localhost:7373/alert \
  -H 'content-type: application/json' \
  -d '{"title":"FOLLOW","text":"bob just followed","duration":4000}'
```

Response: `{"ok":true,"clients":1}` — `clients` is how many overlays received it. `0` means OBS isn't connected.

### Payload

| Field | Required | Notes |
|---|---|---|
| `text` | yes | main line |
| `title` | no | small uppercase label above it |
| `image` | no | URL of an image/GIF, shown above the text |
| `sound` | no | URL of an audio file, played on show |
| `duration` | no | ms on screen, default `5000`, clamped 100–30000 |

Alerts fired back-to-back queue up and play in sequence.

## Theming

Edit the `:root` block at the top of `overlay.html`, or override per-source via the Browser Source URL:

```
http://127.0.0.1:7373/overlay?pos=bottom-right&accent=%23ff0066&width=600
```

`pos`: `top-left` `top` `top-right` `center` `bottom-left` `bottom` `bottom-right`.
Also overridable: `accent` `bg` `fg` `font` `width` `radius` `pad` (URL-encode `#` as `%23`).

Two Browser Sources can point at the same server with different query strings — both get every alert.

## Notes

- Binds `127.0.0.1` only, so nothing off this machine can fire an alert. No auth token by design.
- `PORT=9000 node server.js` to change the port.
- Restarting the server is fine — the overlay reconnects on its own.
- `node test.js` runs the checks.
