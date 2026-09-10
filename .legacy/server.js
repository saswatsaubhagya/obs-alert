// OBS alert server. Zero deps. POST /alert -> SSE -> overlay in OBS Browser Source.
// ponytail: no auth — binds 127.0.0.1 only, that's the trust boundary. Add a token if ever exposed.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 7373;
const MAX_BODY = 64 * 1024;
const OVERLAY = path.join(__dirname, 'overlay.html');

/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();

function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const alert = { text };
  const title = str(raw.title);
  const image = str(raw.image);
  const sound = str(raw.sound);
  if (title) alert.title = title;
  if (image) alert.image = image;
  if (sound) alert.sound = sound;
  const d = Number(raw.duration);
  if (Number.isFinite(d)) alert.duration = Math.min(30000, Math.max(100, d));
  return alert; // unknown keys dropped
}

function broadcast(alert) {
  const frame = `data: ${JSON.stringify(alert)}\n\n`;
  for (const res of clients) res.write(frame);
  return clients.size;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      cb(new Error('body too large'));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
  req.on('error', cb);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && (url.pathname === '/overlay' || url.pathname === '/')) {
    fs.readFile(OVERLAY, (err, buf) => {
      if (err) return json(res, 500, { error: 'overlay.html missing' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(buf);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/alert') {
    readBody(req, (err, body) => {
      if (err) return json(res, 413, { error: 'body too large' });
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { error: 'invalid JSON' });
      }
      const alert = validate(parsed);
      if (!alert) return json(res, 400, { error: 'field "text" required (non-empty string)' });
      json(res, 200, { ok: true, clients: broadcast(alert) });
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

module.exports = { server, validate };

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`OBS alerts up.
  Browser Source URL : http://127.0.0.1:${PORT}/overlay
  Fire an alert      : curl -X POST localhost:${PORT}/alert -H 'content-type: application/json' -d '{"title":"FOLLOW","text":"bob just followed"}'`);
  });
}
