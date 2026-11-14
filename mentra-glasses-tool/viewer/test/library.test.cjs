const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanLibrary, readEvents, resolveInside, parseRange, parseFolderName } = require('../electron/library.cjs');

function makeData() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-'));
  const s = path.join(root, '2026-11-14T20-59-33-164Z_user1');
  fs.mkdirSync(path.join(s, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(s, 'photos', 'photo_000002_2.jpg'), 'b');
  fs.writeFileSync(path.join(s, 'photos', 'photo_000001_1.jpg'), 'a');
  fs.writeFileSync(path.join(s, 'photos', 'notes.txt'), 'not a photo');
  fs.writeFileSync(path.join(s, 'events.jsonl'), '{"time":1,"type":"session_start"}\nnot json\n{"time":2,"type":"photo"}\n');
  fs.mkdirSync(path.join(root, 'empty-folder'));
  const v = path.join(root, 'video', '20261114-210000');
  fs.mkdirSync(path.join(v, 'frames'), { recursive: true });
  fs.writeFileSync(path.join(v, 'recording.mp4'), 'x'.repeat(100));
  fs.writeFileSync(path.join(v, 'frames', 'frame_000001.jpg'), 'f');
  fs.writeFileSync(path.join(v, 'latest.jpg'), 'l');
  return root;
}

test('finds photo sessions and recordings, skips empty folders and non-photos', () => {
  const root = makeData();
  const lib = scanLibrary(root);
  assert.equal(lib.sessions.length, 1);
  const s = lib.sessions[0];
  assert.equal(s.label, 'user1');
  assert.equal(s.time, Date.parse('2026-11-14T20:59:33.164Z'));
  assert.deepEqual(s.photos, ['2026-11-14T20-59-33-164Z_user1/photos/photo_000001_1.jpg', '2026-11-14T20-59-33-164Z_user1/photos/photo_000002_2.jpg']);
  assert.equal(s.events, 3);
  assert.equal(lib.videos.length, 1);
  const v = lib.videos[0];
  assert.equal(v.recording, 'video/20261114-210000/recording.mp4');
  assert.equal(v.recordingBytes, 100);
  assert.equal(v.frames.length, 1);
  assert.equal(v.latest, 'video/20261114-210000/latest.jpg');
  assert.equal(v.live, true);
});

test('a missing data folder is empty, not an error', () => {
  const lib = scanLibrary(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
  assert.deepEqual([lib.sessions, lib.videos], [[], []]);
});

test('events: broken lines are skipped', () => {
  const root = makeData();
  const ev = readEvents(root, '2026-11-14T20-59-33-164Z_user1');
  assert.deepEqual(ev.map((e) => e.type), ['session_start', 'photo']);
  assert.deepEqual(readEvents(root, '../../etc'), []);
});

test('only photos and videos inside the data folder can be served', () => {
  const root = makeData();
  assert.ok(resolveInside(root, '2026-11-14T20-59-33-164Z_user1/photos/photo_000001_1.jpg'));
  assert.equal(resolveInside(root, '../../../etc/passwd'), null);
  assert.equal(resolveInside(root, '/etc/passwd'), null);
  assert.equal(resolveInside(root, '2026-11-14T20-59-33-164Z_user1/photos/notes.txt'), null);
  assert.equal(resolveInside(root, '2026-11-14T20-59-33-164Z_user1/events.jsonl'), null);
  assert.equal(resolveInside(root, 'nope.jpg'), null);
  assert.equal(resolveInside(root, 'a\0.jpg'), null);
  // a symlink that points out of the folder
  const outside = path.join(os.tmpdir(), `outside-${Date.now()}.jpg`);
  fs.writeFileSync(outside, 'secret');
  fs.symlinkSync(outside, path.join(root, 'link.jpg'));
  assert.equal(resolveInside(root, 'link.jpg'), null);
});

test('byte ranges for video seeking', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-5000', 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange('bytes=2000-', 1000), { invalid: true });
  assert.equal(parseRange(null, 1000), null);
  assert.equal(parseRange('items=0-1', 1000), null);
});

test('folder names that are not timestamps keep their name', () => {
  assert.deepEqual(parseFolderName('imu-only'), { time: null, label: 'imu-only' });
});
