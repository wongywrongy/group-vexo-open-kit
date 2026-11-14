// Pretend glasses: try the recorder and the Glasses Viewer with no glasses, no account and no internet.
//   npm run demo                 (Ctrl+C to stop)
// It records through the same code as the real server, into the same data folder, and
// feeds the viewer's live view. Photos are made-up colour pictures.
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { loadDotEnv, readConfig } from './config.mjs';
import { startRecording } from './recording.mjs';
import { startLiveFeed } from './live.mjs';

// ---- a tiny PNG maker, so the demo needs nothing installed ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** A 640x480 picture: a colour gradient that changes with `n`, with a band that moves across. */
export function demoPicture(n, width = 640, height = 480) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const hue = (n * 47) % 360;
  const band = (n * 83) % width;
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const h = (hue + (x / width) * 90) % 360;
      const light = 0.35 + 0.35 * (1 - y / height);
      let [r, g, b] = hslToRgb(h, 0.65, light);
      if (Math.abs(x - band) < 18) [r, g, b] = [245, 245, 245];
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/** An object shaped like the session MentraOS gives the server, driven by timers. */
export function demoSession({ photoDelayMs = 700 } = {}) {
  const handlers = { head: new Set(), button: new Set(), touch: new Set(), battery: new Set(), stream: new Set() };
  const on = (name) => (fn) => {
    handlers[name].add(fn);
    return () => handlers[name].delete(fn);
  };
  const emit = (name, e) => handlers[name].forEach((fn) => fn(e));
  let photos = 0;
  let battery = 91;
  let up = false;
  const timers = [
    setInterval(() => emit('head', { position: (up = !up) ? 'up' : 'down' }), 4000),
    setInterval(() => emit('touch', { gesture_name: Math.random() < 0.5 ? 'forward_swipe' : 'backward_swipe' }), 6500),
    setInterval(() => emit('button', { buttonId: 'camera', pressType: 'short' }), 9000),
    setInterval(() => emit('battery', { level: (battery = Math.max(5, battery - 1)), charging: false }), 12000),
  ];
  setTimeout(() => emit('battery', { level: battery, charging: false }), 300);
  return {
    capabilities: { modelName: 'Demo glasses (pretend)', hasCamera: true, hasDisplay: false, hasIMU: false },
    events: {
      onHeadPosition: on('head'),
      onButtonPress: on('button'),
      onTouchEvent: on('touch'),
      onGlassesBattery: on('battery'),
    },
    camera: {
      async requestPhoto() {
        await new Promise((r) => setTimeout(r, photoDelayMs));
        photos += 1;
        return { buffer: demoPicture(photos), mimeType: 'image/png', requestId: `demo-${photos}`, timestamp: new Date() };
      },
      onStreamStatus: on('stream'),
      async startStream() {},
      async stopStream() {},
    },
    end() {
      timers.forEach(clearInterval);
    },
  };
}

async function main() {
  loadDotEnv();
  const cfg = { ...readConfig(), video: false };
  if (!process.env.PHOTO_INTERVAL_SEC) cfg.photoIntervalSec = 5;
  const live = await startLiveFeed(cfg, { mode: 'demo' });
  const session = demoSession();
  const rec = startRecording({ session, userId: 'demo', cfg, live });
  console.log(`Demo glasses connected. Recording to ${rec.store.dir}`);
  console.log('A photo every', cfg.photoIntervalSec, 'seconds and on every pretend button press. Ctrl+C to stop.');
  const stop = async () => {
    session.end();
    await rec.stop('demo stopped');
    await live?.close();
    console.log(`Stopped. ${rec.store.photoCount} photos saved.`);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
