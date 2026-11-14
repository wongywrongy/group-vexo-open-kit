import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AppServer } from '@mentra/sdk';
import { loadDotEnv, readConfig } from './config.mjs';
import { SessionStore } from './store.mjs';
import { startRecording } from './recording.mjs';
import { startLiveFeed } from './live.mjs';

const MAX_BODY = 64 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function tokenMatches(given, wanted) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(wanted));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GlassesRecorder extends AppServer {
  constructor(cfg, live = null) {
    super({ packageName: cfg.packageName, apiKey: cfg.apiKey, port: cfg.port });
    this.cfg = cfg;
    this.live = live; // feed for the Glasses Viewer app, or null
    this.sessions = new Map(); // MentraOS sessionId -> { store, stop }
    this.standalone = null; // store for IMU samples that arrive while no glasses session is open
    this.#addImuRoute();
  }

  async onSession(session, sessionId, userId) {
    const rec = startRecording({
      session,
      userId,
      cfg: this.cfg,
      live: this.live,
      log: { log: (m) => this.logger.info(m), warn: (m) => this.logger.warn(m) },
    });
    this.logger.info(`glasses connected, recording to ${rec.store.dir}`);
    this.sessions.set(sessionId, rec);
  }

  async onStop(sessionId, userId, reason) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    this.sessions.delete(sessionId);
    await entry.stop(reason);
    this.logger.info(`glasses session ended (${reason}); ${entry.store.photoCount} photos, ${entry.store.imuCount} IMU samples in ${entry.store.dir}`);
  }

  /**
   * POST /imu with header "X-Ingest-Token: <INGEST_TOKEN>" and body {ax,ay,az,gx,gy,gz[,t]} (or a list of them).
   * Not "Authorization": the MentraOS SDK's own middleware reads that header for its web-login tokens.
   */
  #addImuRoute() {
    const app = this.getExpressApp();
    app.post('/imu', async (req, res) => {
      if (!this.cfg.ingestToken) return res.status(404).json({ error: 'IMU ingest is switched off (no INGEST_TOKEN)' });
      const given = req.get('x-ingest-token') ?? '';
      if (!tokenMatches(given, this.cfg.ingestToken)) return res.status(401).json({ error: 'bad token' });
      try {
        // The SDK may already have parsed the body (then the stream is spent); otherwise read it ourselves.
        const body = req._body ? req.body : await readJson(req);
        const samples = Array.isArray(body) ? body.slice(0, 500) : [body];
        const store = this.#imuStore();
        let accepted = 0;
        for (const s of samples) if (store.imu(s)) accepted += 1;
        res.json({ accepted, rejected: samples.length - accepted });
      } catch (err) {
        res.status(400).json({ error: String(err.message) });
      }
    });
  }

  #imuStore() {
    const live = [...this.sessions.values()].at(-1);
    if (live) return live.store;
    this.standalone ??= new SessionStore(this.cfg.dataDir, 'imu-only');
    return this.standalone;
  }

  async stop() {
    await Promise.all([...this.sessions.values()].map((e) => e.stop()));
    this.sessions.clear();
    await this.standalone?.close();
    await this.live?.close();
    return super.stop();
  }
}

async function main() {
  loadDotEnv();
  let cfg;
  try {
    cfg = readConfig();
  } catch (err) {
    console.error(`Settings problem: ${err.message}`);
    process.exit(1);
  }
  if (!cfg.packageName || !cfg.apiKey) {
    console.error('Set PACKAGE_NAME and MENTRAOS_API_KEY (copy .env.example to .env). Both come from console.mentra.glass.');
    process.exit(1);
  }
  const live = await startLiveFeed(cfg);
  const server = new GlassesRecorder(cfg, live);
  await server.start();
  console.log(`Listening on port ${cfg.port}. Point your ngrok tunnel here and start the app on the glasses.`);
  if (cfg.video) console.log(`Video is on. Glasses will push RTMP to ${cfg.rtmpUrl} (run "npm run video" first).`);
  if (!cfg.ingestToken) console.log('Raw IMU ingest (/imu) is off: set INGEST_TOKEN to enable it.');
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => void server.stop().then(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
