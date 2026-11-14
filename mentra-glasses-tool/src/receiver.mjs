// Receive photos and video clips straight from Mentra Live over your Wi-Fi. No Mentra cloud, no ngrok.
//   npm run receive
// Then, in Mentra's example app (Camera screen, "Use cloud server" on), paste the printed
// "Media upload URL". Every photo and every recorded clip lands in data/ and in the Glasses Viewer.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { lanAddress, loadDotEnv, readConfig } from './config.mjs';
import { startLiveFeed } from './live.mjs';
import { SessionStore } from './store.mjs';

export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024; // a few minutes of 720p video

const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** What kind of picture these bytes are, from their first bytes (never trust the name or the type). */
export function photoFormat(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** MP4/MOV files carry "ftyp" at byte 4. */
export const isMp4 = (buf) => buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp';

/** A request id from the network, made safe for a file name. */
export const safeId = (value) =>
  String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || `upload-${Date.now()}`;

function tokenMatches(given, wanted) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(wanted));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Pass bytes through, but fail once more than `max` have gone by. */
function limit(max) {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, done) {
      seen += chunk.length;
      if (seen > max) done(Object.assign(new Error('too large'), { status: 413 }));
      else done(null, chunk);
    },
  });
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * The receiver. Listens on the local network (the glasses must reach it), keeps one folder of
 * photos for this run and one recording folder per video clip.
 */
export async function createReceiver({ dataDir, port = 8787, host = '0.0.0.0', token = '', live = null, publicHost = lanAddress(), log = console, maxBytes = MAX_UPLOAD_BYTES }) {
  const store = new SessionStore(dataDir, 'mentra-app');
  const sessionId = path.basename(store.dir);
  const served = new Map(); // random id -> { file, type }: only files uploaded in this run are served back
  if (live) {
    store.subscribe((event) => live.event(sessionId, event));
    live.sessionStarted({ sessionId, user: 'Mentra app uploads', mode: 'receiver' });
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  async function handleUpload(req, res) {
    if (token) {
      const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (!tokenMatches(given, token)) return json(res, 401, { success: false, error: 'bad token' });
    }
    const type = String(req.headers['content-type'] ?? '');
    if (!type.toLowerCase().startsWith('multipart/form-data')) return json(res, 415, { success: false, error: 'multipart/form-data required' });
    if (Number(req.headers['content-length'] ?? 0) > maxBytes) return json(res, 413, { success: false, error: 'too large' });

    let form;
    try {
      const body = Readable.toWeb(req.pipe(limit(maxBytes)));
      form = await new Request('http://receiver/upload', { method: 'POST', headers: { 'content-type': type }, body, duplex: 'half' }).formData();
    } catch (err) {
      return json(res, err.status === 413 || /too large/.test(String(err?.cause?.message ?? err?.message)) ? 413 : 400, { success: false, error: 'could not read the upload' });
    }
    const field = ['photo', 'video', 'file'].find((name) => form.get(name) instanceof Blob);
    if (!field) return json(res, 400, { success: false, error: 'no photo, video or file field' });
    const blob = form.get(field);
    const buf = Buffer.from(await blob.arrayBuffer());
    if (!buf.length) return json(res, 400, { success: false, error: 'empty file' });
    const requestId = safeId(form.get('requestId'));
    const wantsVideo = field === 'video' || String(blob.type).startsWith('video/');
    const hostHeader = /^[A-Za-z0-9.\-[\]:]+$/.test(String(req.headers.host ?? '')) ? req.headers.host : `${publicHost}:${port}`;
    const mediaId = crypto.randomBytes(16).toString('hex');

    if (wantsVideo) {
      if (!isMp4(buf)) return json(res, 415, { success: false, error: 'video must be MP4' });
      const dir = path.join(path.resolve(dataDir), 'video', `${stamp()}_${requestId}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'recording.mp4');
      await fs.promises.writeFile(file, buf);
      served.set(mediaId, { file, type: 'video/mp4' });
      store.event('video', { file: path.relative(path.resolve(dataDir), file).split(path.sep).join('/'), bytes: buf.length, requestId });
      log.log(`video saved: ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
      const url = `http://${hostHeader}/media/${mediaId}.mp4`;
      return json(res, 200, { success: true, requestId, mediaType: 'video', bytes: buf.length, url, mediaUrl: url, videoUrl: url });
    }

    const format = photoFormat(buf);
    if (!format) return json(res, 415, { success: false, error: 'photo must be JPEG, PNG or WebP' });
    const name = await store.savePhoto(buf, PHOTO_TYPES[format], { reason: 'mentra-app', requestId });
    served.set(mediaId, { file: path.join(store.photosDir, name), type: PHOTO_TYPES[format] });
    log.log(`photo saved: ${name} (${buf.length} bytes)`);
    const url = `http://${hostHeader}/media/${mediaId}.${format}`;
    return json(res, 200, { success: true, requestId, mediaType: 'photo', bytes: buf.length, url, mediaUrl: url, photoUrl: url });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://receiver');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(res, 200, { success: true, service: 'mentra-glasses-tool receiver' });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const entry = served.get(url.pathname.slice('/media/'.length).split('.')[0]);
      if (!entry) return json(res, 404, { success: false, error: 'not found' });
      res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-store' });
      return fs.createReadStream(entry.file).pipe(res);
    }
    if (req.method === 'POST' && url.pathname === '/upload') {
      handleUpload(req, res).catch((err) => {
        log.warn(`upload failed: ${err.message}`);
        if (!res.headersSent) json(res, 500, { success: false, error: 'could not save' });
      });
      return;
    }
    json(res, 404, { success: false, error: 'not found' });
  });
  server.requestTimeout = 10 * 60 * 1000; // a big clip over slow Wi-Fi

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actualPort = server.address().port;
  store.event('receiver_start', { port: actualPort });

  return {
    port: actualPort,
    uploadUrl: `http://${publicHost}:${actualPort}/upload`,
    store,
    sessionId,
    async close(reason = 'stopped') {
      await new Promise((resolve) => server.close(() => resolve()));
      server.closeAllConnections?.();
      store.event('session_end', { reason });
      await store.close();
      live?.sessionEnded(sessionId, { reason, photos: store.photoCount });
    },
  };
}

async function main() {
  loadDotEnv();
  const cfg = readConfig();
  const port = Number(process.env.RECEIVER_PORT ?? 8787);
  const publicHost = lanAddress();
  const rtmpUrl = `rtmp://${publicHost}:1935/live/glasses`;
  const live = await startLiveFeed(cfg, { mode: 'receiver', uploadUrl: `http://${publicHost}:${port}/upload`, rtmpUrl });
  let receiver;
  try {
    receiver = await createReceiver({ dataDir: cfg.dataDir, port, token: process.env.UPLOAD_TOKEN ?? '', live, publicHost });
  } catch (err) {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is busy (is Mentra's own receiver running?). Set RECEIVER_PORT to another port.` : err.message);
    await live?.close();
    process.exit(1);
  }
  console.log('');
  console.log('Receiving photos and videos from Mentra Live.');
  console.log(`  Media upload URL:  ${receiver.uploadUrl}`);
  console.log(`  Live video (RTMP): ${rtmpUrl}   (run "npm run video" for this)`);
  console.log(`  Saving to:         ${receiver.store.dir}`);
  console.log('');
  console.log('In the Mentra example app: Camera screen, turn on "Use cloud server", paste the Media upload URL,');
  console.log('then take photos or record video. The glasses must be on the same Wi-Fi as this computer.');
  if (!process.env.UPLOAD_TOKEN) console.log('Anyone on this Wi-Fi can send files here while it runs: stop it (Ctrl+C) when you are done.');
  const stop = async () => {
    await receiver.close('stopped');
    await live?.close();
    console.log(`Stopped. ${receiver.store.photoCount} photos saved.`);
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
