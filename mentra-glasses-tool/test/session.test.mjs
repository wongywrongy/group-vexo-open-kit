import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/store.mjs';
import { attachSession } from '../src/session.mjs';
import { readConfig } from '../src/config.mjs';

const quiet = { log() {}, warn() {} };
const lines = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

function fakeSession({ photoFails = false } = {}) {
  const handlers = {};
  const sub = (name) => (fn) => {
    handlers[name] = fn;
    return () => delete handlers[name];
  };
  const calls = { photos: 0, startStream: null, stopStream: 0 };
  return {
    handlers,
    calls,
    capabilities: { hasCamera: true },
    events: {
      onHeadPosition: sub('head'),
      onButtonPress: sub('button'),
      onTouchEvent: sub('touch'),
      onGlassesBattery: sub('battery'),
    },
    camera: {
      async requestPhoto() {
        calls.photos += 1;
        if (photoFails) throw new Error('Camera busy!');
        return { buffer: Buffer.from('jpegbytes'), mimeType: 'image/jpeg', requestId: `r${calls.photos}`, timestamp: new Date() };
      },
      onStreamStatus: sub('stream'),
      async startStream(opts) {
        calls.startStream = opts;
      },
      async stopStream() {
        calls.stopStream += 1;
      },
    },
  };
}

const setup = (envOver, sessOver) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasses-'));
  const cfg = readConfig({ PACKAGE_NAME: 'p', MENTRAOS_API_KEY: 'k', ...envOver });
  const session = fakeSession(sessOver);
  const store = new SessionStore(root, 'u');
  const stop = attachSession(session, store, cfg, quiet);
  return { session, store, stop, cfg };
};
const events = (store) => lines(path.join(store.dir, 'events.jsonl'));

test('records head, button, touch and battery events', async () => {
  const { session, store, stop } = setup({ PHOTO_INTERVAL_SEC: '0' });
  session.handlers.head({ position: 'up' });
  session.handlers.touch({ gesture_name: 'forward_swipe' });
  session.handlers.battery({ level: 80, charging: false });
  session.handlers.button({ buttonId: 'main', pressType: 'long' });
  await stop();
  const types = events(store).map((e) => e.type);
  assert.deepEqual(types, ['session_start', 'head_position', 'touch', 'battery', 'button', 'session_end']);
  assert.equal(session.calls.photos, 0);
});

test('a short button press takes a photo; a long one does not', async () => {
  const { session, store, stop } = setup({ PHOTO_INTERVAL_SEC: '0' });
  session.handlers.button({ buttonId: 'main', pressType: 'long' });
  assert.equal(session.calls.photos, 0);
  session.handlers.button({ buttonId: 'main', pressType: 'short' });
  await new Promise((r) => setTimeout(r, 20));
  await stop();
  assert.equal(session.calls.photos, 1);
  assert.equal(store.photoCount, 1);
});

test('timer photos do not overlap and a failed photo is logged, not thrown', async () => {
  const { session, store, stop } = setup({ PHOTO_INTERVAL_SEC: '0.01' }, { photoFails: true });
  await new Promise((r) => setTimeout(r, 60));
  await stop();
  assert.ok(session.calls.photos >= 1);
  assert.ok(events(store).some((e) => e.type === 'photo_error' && /busy/.test(e.message)));
});

test('video mode starts one RTMP stream, turns photos off, stops the stream on exit', async () => {
  const { session, store, stop, cfg } = setup({ VIDEO: '1', RTMP_URL: 'rtmp://10.0.0.5:1935/live/glasses' });
  assert.equal(cfg.photoIntervalSec, 0);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(session.calls.startStream.rtmpUrl, 'rtmp://10.0.0.5:1935/live/glasses');
  assert.equal(session.calls.startStream.video.width, 1280);
  session.handlers.stream({ status: 'streaming', stats: { fps: 15 } });
  session.handlers.button({ buttonId: 'main', pressType: 'short' }); // no photo while streaming
  await stop();
  assert.equal(session.calls.photos, 0);
  assert.equal(session.calls.stopStream, 1);
  assert.ok(events(store).some((e) => e.type === 'stream_status' && e.status === 'streaming'));
});

test('stop is safe to call twice', async () => {
  const { stop } = setup({ PHOTO_INTERVAL_SEC: '0' });
  await stop();
  await stop();
});

test('bad settings are refused with a clear message', () => {
  assert.throws(() => readConfig({ PHOTO_SIZE: 'huge' }), /PHOTO_SIZE/);
  assert.throws(() => readConfig({ PORT: 'abc' }), /PORT/);
});
