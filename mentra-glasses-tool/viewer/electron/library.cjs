// Reads the folder that mentra-glasses-tool writes. No Electron here, so it can be tested with plain Node.
const fs = require('node:fs');
const path = require('node:path');

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO = new Set(['.mp4', '.mkv', '.webm']);
const TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
};

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const list = (p) => { try { return fs.readdirSync(p).sort(); } catch { return []; } };
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');

function countLines(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text ? text.split('\n').filter(Boolean).length : 0;
  } catch { return 0; }
}

/** Folder names look like 2026-11-14T20-59-33-164Z_user. Turn the first part back into a time. */
function parseFolderName(name) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_(.*)$/.exec(name);
  if (!m) return { time: null, label: name };
  return { time: Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`), label: m[6] };
}

/** Everything in the data folder: photo sessions and video recordings, newest first. */
function scanLibrary(root) {
  root = path.resolve(root);
  const sessions = [];
  for (const name of list(root)) {
    const dir = path.join(root, name);
    if (name === 'video' || !isDir(dir)) continue;
    const photosDir = path.join(dir, 'photos');
    const photos = list(photosDir).filter((f) => IMAGE.has(path.extname(f).toLowerCase())).map((f) => rel(root, path.join(photosDir, f)));
    const hasEvents = fs.existsSync(path.join(dir, 'events.jsonl'));
    if (!photos.length && !hasEvents && !fs.existsSync(path.join(dir, 'imu.jsonl'))) continue;
    const { time, label } = parseFolderName(name);
    sessions.push({
      id: name, label, time: time ?? mtime(dir), photos,
      events: countLines(path.join(dir, 'events.jsonl')),
      imu: countLines(path.join(dir, 'imu.jsonl')),
    });
  }

  const videos = [];
  const videoRoot = path.join(root, 'video');
  for (const name of list(videoRoot)) {
    const dir = path.join(videoRoot, name);
    if (!isDir(dir)) continue;
    const files = list(dir);
    const recording = files.find((f) => /^recording\./.test(f) && VIDEO.has(path.extname(f).toLowerCase()));
    const frames = list(path.join(dir, 'frames')).filter((f) => IMAGE.has(path.extname(f).toLowerCase()));
    const latest = files.includes('latest.jpg') ? path.join(dir, 'latest.jpg') : null;
    if (!recording && !frames.length && !latest) continue;
    const recPath = recording ? path.join(dir, recording) : null;
    const newest = Math.max(mtime(recPath), mtime(latest));
    videos.push({
      id: name,
      time: newest || mtime(dir),
      recording: recPath ? rel(root, recPath) : null,
      recordingBytes: recPath ? fs.statSync(recPath).size : 0,
      frames: frames.map((f) => rel(root, path.join(dir, 'frames', f))),
      latest: latest ? rel(root, latest) : null,
      live: Date.now() - newest < 5000, // something was written in the last 5 seconds
    });
  }

  sessions.sort((a, b) => b.time - a.time);
  videos.sort((a, b) => b.time - a.time);
  return { root, sessions, videos };
}

/** The events of one session. Lines that are not JSON are skipped, not fatal. */
function readEvents(root, sessionId, limit = 2000) {
  const file = resolveInside(root, `${sessionId}/events.jsonl`, { anyType: true });
  if (!file) return [];
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* half-written or broken line */ }
  }
  return out.slice(-limit);
}

/**
 * Turn a path from the page into a real file, but only one inside the data folder
 * (also after following symlinks) and only a photo or a video.
 */
function resolveInside(root, relPath, { anyType = false } = {}) {
  if (typeof relPath !== 'string' || relPath.includes('\0')) return null;
  let realRoot;
  try { realRoot = fs.realpathSync(path.resolve(root)); } catch { return null; }
  const full = path.resolve(realRoot, relPath);
  let real;
  try { real = fs.realpathSync(full); } catch { return null; }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
  const ext = path.extname(real).toLowerCase();
  if (!anyType && !IMAGE.has(ext) && !VIDEO.has(ext)) return null;
  return real;
}

const contentType = (file) => TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/** Parse "bytes=START-END" for a file of `size` bytes. Returns {start,end} or null (whole file / unusable). */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || size === 0) return null;
  let start; let end;
  if (m[1] === '') { // last N bytes
    if (m[2] === '') return null;
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

module.exports = { scanLibrary, readEvents, resolveInside, contentType, parseRange, parseFolderName };
