import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createLiveFeed } from '../src/live.mjs';
import { startRecording } from '../src/recording.mjs';
import { demoSession, demoPicture } from '../src/demo.mjs';
import { readConfig } from '../src/config.mjs';

/** Connect like the viewer does and collect messages. */
function listen(port, host = '127.0.0.1') {
  const messages = [];
  let req;
  const ready = new Promise((resolve, reject) => {
    req = http.get({ host: '127.0.0.1', port, path: '/live', headers: { host: `${host}:${port}` } }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          for (const line of block.split('\n')) if (line.startsWith('data: ')) messages.push(JSON.parse(line.slice(6)));
        }
      });
      resolve(res);
    });
    req.on('error', reject);
  });
  return { messages, ready, close: () => req.destroy() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await wait(20);
  }
}

test('live feed: status first, then events; replay for late viewers', async () => {
  const live = await createLiveFeed({ port: 0, recorder: { dataDir: '/x' } });
  const a = listen(live.port);
  await a.ready;
  await until(() => a.messages.length >= 1);
  assert.equal(a.messages[0].kind, 'status');
  assert.deepEqual(a.messages[0].sessions, []);
  live.sessionStarted({ sessionId: 's1', user: 'u' });
  live.event('s1', { time: 1, type: 'head_position', position: 'up' });
  await until(() => a.messages.length >= 3);
  assert.equal(a.messages[1].sessions[0].sessionId, 's1');
  assert.equal(a.messages[2].event.type, 'head_position');
  const b = listen(live.port);
  await b.ready;
  await until(() => b.messages.length >= 2);
  assert.equal(b.messages[1].event.position, 'up'); // replayed
  live.sessionEnded('s1', { reason: 'bye' });
  await until(() => a.messages.some((m) => m.ended));
  assert.deepEqual(a.messages.at(-1).sessions, []);
  a.close();
  b.close();
  await live.close();
});

test('live feed: only this computer, only /live', async () => {
  const live = await createLiveFeed({ port: 0 });
  const get = (pathName, host) =>
    new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: live.port, path: pathName, headers: { host } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
    });
  assert.equal(await get('/live', `evil.example.com:${live.port}`), 403);
  assert.equal(await get('/other', `127.0.0.1:${live.port}`), 404);
  await live.close();
});

test('live feed listens on 127.0.0.1 only', async () => {
  const live = await createLiveFeed({ port: 0 });
  const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
  if (lan) {
    const err = await new Promise((resolve) => {
      const req = http.get({ host: lan.address, port: live.port, path: '/live', timeout: 1000 }, (res) => resolve(res.statusCode));
      req.on('error', (e) => resolve(e.code));
      req.on('timeout', () => resolve('timeout'));
    });
    assert.notEqual(err, 200);
  }
  await live.close();
});

test('a demo recording reaches the live feed and the disk', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasses-'));
  const cfg = { ...readConfig({ DATA_DIR: root, PHOTO_INTERVAL_SEC: '0.2' }), video: false };
  const live = await createLiveFeed({ port: 0 });
  const viewer = listen(live.port);
  await viewer.ready;
  const session = demoSession({ photoDelayMs: 10 });
  const rec = startRecording({ session, userId: 'demo', cfg, live, log: { log() {}, warn() {} } });
  await until(() => viewer.messages.some((m) => m.kind === 'event' && m.event.type === 'photo'));
  session.end();
  await rec.stop('test');
  const photo = viewer.messages.find((m) => m.kind === 'event' && m.event.type === 'photo');
  assert.equal(photo.sessionId, rec.sessionId);
  const file = path.join(root, photo.sessionId, photo.event.file);
  assert.ok(fs.statSync(file).size > 1000);
  assert.deepEqual([...fs.readFileSync(file).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]); // PNG
  await until(() => viewer.messages.some((m) => m.ended?.sessionId === rec.sessionId));
  viewer.close();
  await live.close();
});

test('demo pictures differ from one another', () => {
  assert.notDeepEqual(demoPicture(1), demoPicture(2));
});
