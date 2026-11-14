import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore, safeLabel, parseImuSample } from '../src/store.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'glasses-'));
const lines = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a hostile label cannot leave the data folder', async () => {
  const root = tmp();
  const store = new SessionStore(root, '../../etc/passwd');
  assert.equal(path.dirname(store.dir), path.resolve(root));
  assert.match(path.basename(store.dir), /^[0-9TZ-]+_etc_passwd$/);
  await store.close();
  assert.equal(safeLabel(''), 'unknown');
  assert.equal(safeLabel('///'), 'unknown');
});

test('events and photos are written, photo name is ours not the glasses\'', async () => {
  const store = new SessionStore(tmp(), 'user1');
  store.event('head_position', { position: 'up' });
  const name = await store.savePhoto(Buffer.from([1, 2, 3]), 'image/jpeg', { requestId: 'r1' });
  assert.match(name, /^photo_000001_\d+\.jpg$/);
  assert.deepEqual([...fs.readFileSync(path.join(store.photosDir, name))], [1, 2, 3]);
  await store.close();
  const ev = lines(path.join(store.dir, 'events.jsonl'));
  assert.equal(ev[0].type, 'head_position');
  assert.equal(ev[1].type, 'photo');
  assert.equal(ev[1].file, `photos/${name}`);
});

test('imu samples are checked and stored', async () => {
  const store = new SessionStore(tmp(), 'u');
  assert.equal(store.imu({ ax: 0, ay: 0.1, az: 1, gx: 1, gy: 2, gz: 3, t: 5 }), true);
  assert.equal(store.imu({ ax: 'nope' }), false);
  assert.equal(store.imu({}), false);
  assert.equal(store.imu(null), false);
  assert.equal(store.imu({ ax: Infinity }), false);
  await store.close();
  const rows = lines(path.join(store.dir, 'imu.jsonl'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].az, 1);
  assert.equal(rows[0].sourceT, 5);
  assert.equal(parseImuSample({ ax: 1, evil: 'x' }).evil, undefined);
});

test('nothing is written after close', async () => {
  const store = new SessionStore(tmp(), 'u');
  await store.close();
  store.event('late');
  assert.equal(store.imu({ ax: 1 }), false);
});
