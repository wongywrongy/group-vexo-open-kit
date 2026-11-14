const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createSseParser, connectLive, livePort } = require('../electron/live-client.cjs');

test('messages split across chunks are put back together; pings and junk are skipped', () => {
  const got = [];
  const feed = createSseParser((m) => got.push(m));
  feed(': hello\n\ndata: {"kind":"st');
  feed('atus"}\n\ndata: not json\n\n');
  feed('data: {"kind":"event","n":1}\r\n\r\n: ping\n\n');
  assert.deepEqual(got, [{ kind: 'status' }, { kind: 'event', n: 1 }]);
});

test('LIVE_PORT: environment first, then the .env line, else 3001', () => {
  assert.equal(livePort('', {}), 3001);
  assert.equal(livePort('PORT=3000\nLIVE_PORT=4555\n', {}), 4555);
  assert.equal(livePort('LIVE_PORT=4555', { LIVE_PORT: '4999' }), 4999);
  assert.equal(livePort('# LIVE_PORT=4555', {}), 3001);
});

test('connects, receives, notices the recorder going away and coming back', async () => {
  let res;
  const server = http.createServer((req, r) => {
    res = r;
    r.writeHead(200, { 'Content-Type': 'text/event-stream' });
    r.write('data: {"kind":"status"}\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const states = [];
  const msgs = [];
  const stop = connectLive({ port, onMessage: (m) => msgs.push(m), onState: (s) => states.push(s), retryMs: 50 });
  const until = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); assert.ok(fn()); };
  await until(() => msgs.length === 1);
  res.end(); // recorder stops
  await until(() => states.includes(false));
  await until(() => msgs.length === 2); // and it reconnected
  assert.deepEqual(states.slice(0, 3), [true, false, true]);
  stop();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});
