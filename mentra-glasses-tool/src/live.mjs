import http from 'node:http';
import path from 'node:path';

const REPLAY = 100; // events a newly connected viewer gets at once

/**
 * The live feed the Glasses Viewer app listens to: Server-Sent Events on this computer only.
 *
 *   GET http://127.0.0.1:<port>/live
 *
 * Messages (one JSON per `data:` line):
 *   { kind: 'status', recorder: {...}, sessions: [...] }   first, and after every change
 *   { kind: 'event', sessionId, event }                      every event a session writes
 *
 * It listens on 127.0.0.1 only, sends no CORS headers (so web pages cannot read it) and
 * refuses requests whose Host is not this computer (so a web page cannot reach it by DNS tricks).
 */
export async function createLiveFeed({ port, host = '127.0.0.1', recorder = {} }) {
  const clients = new Set();
  const sessions = new Map(); // sessionId -> info
  const recent = [];

  const status = () => ({ kind: 'status', time: Date.now(), recorder, sessions: [...sessions.values()] });
  const send = (res, msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  const broadcast = (msg) => {
    for (const res of clients) send(res, msg);
  };

  const server = http.createServer((req, res) => {
    const hostHeader = String(req.headers.host ?? '');
    const local = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(hostHeader);
    if (!local) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== 'GET' || req.url !== '/live') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': hello\n\n');
    send(res, status());
    for (const msg of recent) send(res, msg);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 15000);
  heartbeat.unref();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    port: server.address().port,

    sessionStarted(info) {
      sessions.set(info.sessionId, { ...info, startedAt: Date.now() });
      broadcast(status());
    },

    sessionEnded(sessionId, extra = {}) {
      sessions.delete(sessionId);
      broadcast({ ...status(), ended: { sessionId, ...extra } });
    },

    event(sessionId, event) {
      const msg = { kind: 'event', sessionId, event };
      recent.push(msg);
      if (recent.length > REPLAY) recent.shift();
      broadcast(msg);
    },

    async close() {
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      clients.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

/** The viewer's live feed. A busy port is reported, not fatal: recording works without it. */
export async function startLiveFeed(cfg, extra = {}) {
  if (!cfg.livePort) return null;
  try {
    const live = await createLiveFeed({
      port: cfg.livePort,
      recorder: {
        mode: 'cloud',
        startedAt: Date.now(),
        dataDir: path.resolve(cfg.dataDir),
        video: cfg.video,
        rtmpUrl: cfg.video ? cfg.rtmpUrl : null,
        photoIntervalSec: cfg.photoIntervalSec,
        ...extra,
      },
    });
    console.log(`Live feed for the Glasses Viewer on http://127.0.0.1:${live.port}/live (this computer only).`);
    return live;
  } catch (err) {
    console.warn(`Live feed not started (${err.code ?? err.message}); the viewer will still find saved files. Set LIVE_PORT to a free port.`);
    return null;
  }
}
