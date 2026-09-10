// Run: node test.js   — covers the two bits with real logic: validation + SSE broadcast.
const assert = require('node:assert');
const http = require('node:http');
const { server, validate } = require('./server');

// --- validation ---
assert.strictEqual(validate(null), null);
assert.strictEqual(validate({}), null);
assert.strictEqual(validate({ text: '   ' }), null);
assert.strictEqual(validate([{ text: 'x' }]), null);
assert.deepStrictEqual(validate({ text: 'hi', evil: 1 }), { text: 'hi' });
assert.strictEqual(validate({ text: 'hi', duration: 999999 }).duration, 30000);
assert.strictEqual(validate({ text: 'hi', duration: 1 }).duration, 100);
assert.strictEqual(validate({ text: 'hi', duration: 'nope' }).duration, undefined);

const post = (port, body) =>
  new Promise((resolve) => {
    const req = http.request(
      { port, host: '127.0.0.1', method: 'POST', path: '/alert', headers: { 'content-type': 'application/json' } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ code: res.statusCode, body: d }));
      }
    );
    req.end(body);
  });

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;

  // open an SSE client, wait for it to register
  const frames = [];
  await new Promise((resolve) => {
    http.get({ port, host: '127.0.0.1', path: '/events' }, (res) => {
      res.on('data', (c) => frames.push(c.toString()));
      resolve();
    });
  });
  await new Promise((r) => setTimeout(r, 50));

  const ok = await post(port, JSON.stringify({ text: 'bob followed', title: 'FOLLOW' }));
  assert.strictEqual(ok.code, 200);
  assert.strictEqual(JSON.parse(ok.body).clients, 1, 'alert should reach the connected overlay');

  await new Promise((r) => setTimeout(r, 50));
  const sse = frames.join('');
  assert.match(sse, /^data: .*bob followed/m, 'SSE frame should carry the alert');
  assert.strictEqual(JSON.parse(sse.match(/^data: (.*)$/m)[1]).title, 'FOLLOW');

  assert.strictEqual((await post(port, '{"text":"")')).code, 400, 'bad JSON -> 400');
  assert.strictEqual((await post(port, '{"nope":1}')).code, 400, 'missing text -> 400');

  console.log('ok — validation + broadcast');
  process.exit(0);
});
