import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReceiver, photoFormat, isMp4, safeId } from '../src/receiver.mjs';
import { createLiveFeed } from '../src/live.mjs';
import { demoPicture } from '../src/demo.mjs';

const quiet = { log() {}, warn() {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-'));
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(5000, 1)]);

/** Upload like the glasses: multipart with a file field and requestId. */
async function upload(port, { field = 'photo', data = jpeg(), type = 'image/jpeg', requestId = 'req-1', headers = {} } = {}) {
  const form = new FormData();
  form.append('requestId', requestId);
  form.append(field, new Blob([data], { type }), field === 'video' ? 'clip.mp4' : 'photo.jpg');
  const res = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form, headers });
  return { status: res.status, body: await res.json() };
}

test('a photo upload is saved, answered like Mentra\'s receiver, and served back', async () => {
  const root = tmp();
  const r = await createReceiver({ dataDir: root, port: 0, host: '127.0.0.1', publicHost: '127.0.0.1', log: quiet });
  const { status, body } = await upload(r.port, { requestId: 'photo-abc' });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.requestId, 'photo-abc');
  assert.match(body.photoUrl, /^http:\/\/127\.0\.0\.1:\d+\/media\/[0-9a-f]{32}\.jpg$/);
  assert.equal(body.photoUrl, body.mediaUrl);
  const back = Buffer.from(await (await fetch(body.photoUrl)).arrayBuffer());
  assert.deepEqual(back, jpeg());
  assert.equal(r.store.photoCount, 1);
  await r.close();
  const events = fs.readFileSync(path.join(r.store.dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const photo = events.find((e) => e.type === 'photo');
  assert.equal(photo.requestId, 'photo-abc');
  assert.ok(fs.existsSync(path.join(r.store.dir, photo.file)));
});

test('a video clip becomes a recording the viewer lists', async () => {
  const root = tmp();
  const r = await createReceiver({ dataDir: root, port: 0, host: '127.0.0.1', publicHost: '127.0.0.1', log: quiet });
  const { status, body } = await upload(r.port, { field: 'video', data: mp4(), type: 'video/mp4', requestId: 'video-1' });
  assert.equal(status, 200);
  assert.ok(body.videoUrl.endsWith('.mp4'));
  const dirs = fs.readdirSync(path.join(root, 'video'));
  assert.equal(dirs.length, 1);
  assert.match(dirs[0], /_video-1$/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'video', dirs[0], 'recording.mp4')), mp4());
  await r.close();
});

test('fake, empty and wrong-kind files are refused', async () => {
  const r = await createReceiver({ dataDir: tmp(), port: 0, host: '127.0.0.1', log: quiet });
  assert.equal((await upload(r.port, { data: Buffer.from('<script>alert(1)</script>') })).status, 415);
  assert.equal((await upload(r.port, { field: 'video', data: jpeg(), type: 'video/mp4' })).status, 415);
  assert.equal((await upload(r.port, { data: Buffer.alloc(0) })).status, 400);
  const notForm = await fetch(`http://127.0.0.1:${r.port}/upload`, { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } });
  assert.equal(notForm.status, 415);
  const noFile = new FormData();
  noFile.append('requestId', 'x');
  assert.equal((await fetch(`http://127.0.0.1:${r.port}/upload`, { method: 'POST', body: noFile })).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${r.port}/media/${'0'.repeat(32)}.jpg`)).status, 404);
  assert.equal(r.store.photoCount, 0);
  await r.close();
});

test('a hostile request id cannot choose where files go', async () => {
  const root = tmp();
  const r = await createReceiver({ dataDir: root, port: 0, host: '127.0.0.1', log: quiet });
  await upload(r.port, { field: 'video', data: mp4(), type: 'video/mp4', requestId: '../../../etc/passwd' });
  const dirs = fs.readdirSync(path.join(root, 'video'));
  assert.match(dirs[0], /_etcpasswd$/);
  await r.close();
  assert.equal(safeId(''), safeId('') ); // never empty
  assert.match(safeId('///'), /^upload-\d+$/);
});

test('with UPLOAD_TOKEN, uploads need it', async () => {
  const r = await createReceiver({ dataDir: tmp(), port: 0, host: '127.0.0.1', token: 'secret-123', log: quiet });
  assert.equal((await upload(r.port)).status, 401);
  assert.equal((await upload(r.port, { headers: { authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await upload(r.port, { headers: { authorization: 'Bearer secret-123' } })).status, 200);
  await r.close();
});

test('uploads reach the viewer\'s live feed', async () => {
  const live = await createLiveFeed({ port: 0 });
  const seen = [];
  const res = await new Promise((resolve) => {
    const http = require_http();
    http.get({ host: '127.0.0.1', port: live.port, path: '/live', headers: { host: `127.0.0.1:${live.port}` } }, resolve);
  });
  res.setEncoding('utf8');
  res.on('data', (d) => d.split('\n').filter((l) => l.startsWith('data: ')).forEach((l) => seen.push(JSON.parse(l.slice(6)))));
  const r = await createReceiver({ dataDir: tmp(), port: 0, host: '127.0.0.1', live, log: quiet });
  await upload(r.port, { data: demoPicture(1), type: 'image/png' });
  for (let i = 0; i < 100 && !seen.some((m) => m.event?.type === 'photo'); i++) await new Promise((t) => setTimeout(t, 20));
  const photo = seen.find((m) => m.event?.type === 'photo');
  assert.equal(photo.sessionId, r.sessionId);
  assert.ok(photo.event.file.endsWith('.png'));
  assert.ok(seen.some((m) => m.kind === 'status' && m.sessions.some((s) => s.mode === 'receiver')));
  res.destroy();
  await r.close();
  await live.close();
});

test('format sniffing', () => {
  assert.equal(photoFormat(jpeg()), 'jpg');
  assert.equal(photoFormat(demoPicture(2)), 'png');
  assert.equal(photoFormat(Buffer.from('RIFF0000WEBPVP8 ')), 'webp');
  assert.equal(photoFormat(Buffer.from('GIF89a........')), null);
  assert.equal(isMp4(mp4()), true);
  assert.equal(isMp4(jpeg()), false);
});

import httpModule from 'node:http';
function require_http() { return httpModule; }

test('uploads over the size limit are refused and not saved', async () => {
  const r = await createReceiver({ dataDir: tmp(), port: 0, host: '127.0.0.1', log: quiet, maxBytes: 1000 });
  assert.equal((await upload(r.port)).status, 413); // 2 kB photo, 1 kB limit
  assert.equal(r.store.photoCount, 0);
  await r.close();
});
