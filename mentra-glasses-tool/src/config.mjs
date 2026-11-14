import os from 'node:os';

/** Load .env from the folder the program is started in (environment variables win). */
export function loadDotEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* no .env file: fine, plain environment variables still work */
  }
}

/** First non-internal IPv4 address of this computer, for the glasses to reach it on Wi-Fi. */
export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

const oneOf = (value, allowed, name) => {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')} (got "${value}")`);
  }
  return value;
};

const num = (value, name, { min = 0 } = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number >= ${min} (got "${value}")`);
  return n;
};

/** Turn environment variables into a checked settings object. */
export function readConfig(env = process.env) {
  const video = env.VIDEO === '1';
  const rtmpPort = 1935;
  return {
    packageName: env.PACKAGE_NAME ?? '',
    apiKey: env.MENTRAOS_API_KEY ?? '',
    port: num(env.PORT ?? 3000, 'PORT', { min: 1 }),
    dataDir: env.DATA_DIR ?? './data',
    // One camera, one job: with video on, photos are off unless asked for explicitly.
    photoIntervalSec: num(env.PHOTO_INTERVAL_SEC ?? (video ? 0 : 10), 'PHOTO_INTERVAL_SEC'),
    photoSize: oneOf(env.PHOTO_SIZE ?? 'medium', ['small', 'medium', 'large', 'full'], 'PHOTO_SIZE'),
    photoCompress: oneOf(env.PHOTO_COMPRESS ?? 'medium', ['none', 'medium', 'heavy'], 'PHOTO_COMPRESS'),
    video,
    rtmpUrl: env.RTMP_URL || `rtmp://${lanAddress()}:${rtmpPort}/live/glasses`,
    videoConfig: {
      width: num(env.VIDEO_WIDTH ?? 1280, 'VIDEO_WIDTH', { min: 1 }),
      height: num(env.VIDEO_HEIGHT ?? 720, 'VIDEO_HEIGHT', { min: 1 }),
      frameRate: num(env.VIDEO_FPS ?? 15, 'VIDEO_FPS', { min: 1 }),
      bitrate: num(env.VIDEO_BITRATE ?? 2_000_000, 'VIDEO_BITRATE', { min: 1 }),
    },
    ingestToken: env.INGEST_TOKEN ?? '',
    // Live feed for the Glasses Viewer app, on this computer only. 0 switches it off.
    livePort: num(env.LIVE_PORT ?? 3001, 'LIVE_PORT'),
  };
}
