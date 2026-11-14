import fs from 'node:fs';
import path from 'node:path';

const EXT = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** A label from outside (a user id) must never choose where files go. */
export function safeLabel(label) {
  const clean = String(label ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+/, '').slice(0, 40);
  return clean || 'unknown';
}

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');

const IMU_FIELDS = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];

/**
 * Check one raw sample: every field present must be a finite number.
 * Returns a clean object, or null when the sample is unusable.
 */
export function parseImuSample(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of IMU_FIELDS) {
    if (raw[key] === undefined) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) return null;
    out[key] = n;
  }
  if (Object.keys(out).length === 0) return null;
  if (raw.t !== undefined) {
    const t = Number(raw.t);
    if (!Number.isFinite(t)) return null;
    out.sourceT = t;
  }
  return out;
}

/**
 * One recording folder:
 *   events.jsonl   head / button / touch / battery / stream / photo news, one JSON per line
 *   imu.jsonl      raw accelerometer and gyro samples (only when something supplies them)
 *   photos/        screenshots
 */
export class SessionStore {
  constructor(root, label) {
    this.dir = path.join(path.resolve(root), `${stamp()}_${safeLabel(label)}`);
    this.photosDir = path.join(this.dir, 'photos');
    fs.mkdirSync(this.photosDir, { recursive: true });
    this.eventsStream = fs.createWriteStream(path.join(this.dir, 'events.jsonl'), { flags: 'a' });
    this.imuStream = null;
    this.photoCount = 0;
    this.imuCount = 0;
    this.closed = false;
    this.subscribers = new Set();
  }

  /** Call `fn(record)` for every event written from now on. Returns a function that stops it. */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  event(type, data = {}) {
    if (this.closed) return;
    const record = { time: Date.now(), type, ...data };
    this.eventsStream.write(JSON.stringify(record) + '\n');
    for (const fn of this.subscribers) {
      try {
        fn(record);
      } catch {
        /* a listener's problem never stops the recording */
      }
    }
  }

  imu(sample) {
    if (this.closed) return false;
    const clean = parseImuSample(sample);
    if (!clean) return false;
    this.imuStream ??= fs.createWriteStream(path.join(this.dir, 'imu.jsonl'), { flags: 'a' });
    this.imuStream.write(JSON.stringify({ time: Date.now(), ...clean }) + '\n');
    this.imuCount += 1;
    return true;
  }

  /** Save a photo's bytes under a name we choose; the name the glasses suggest is ignored. */
  async savePhoto(buffer, mimeType, meta = {}) {
    this.photoCount += 1;
    const ext = EXT[String(mimeType).toLowerCase()] ?? '.bin';
    const name = `photo_${String(this.photoCount).padStart(6, '0')}_${Date.now()}${ext}`;
    await fs.promises.writeFile(path.join(this.photosDir, name), buffer);
    this.event('photo', { file: `photos/${name}`, bytes: buffer.length, mimeType, ...meta });
    return name;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const end = (s) => (s ? new Promise((r) => s.end(r)) : Promise.resolve());
    await Promise.all([end(this.eventsStream), end(this.imuStream)]);
  }
}
