import path from 'node:path';
import { SessionStore } from './store.mjs';
import { attachSession } from './session.mjs';

/**
 * Start recording one glasses session and tell the live feed about everything it writes.
 * Used by the real server and by the demo, so both behave the same.
 */
export function startRecording({ session, userId, cfg, live = null, log = console }) {
  const store = new SessionStore(cfg.dataDir, userId);
  const sessionId = path.basename(store.dir);
  const unsubscribe = live ? store.subscribe((event) => live.event(sessionId, event)) : () => {};
  live?.sessionStarted({ sessionId, user: String(userId ?? ''), video: cfg.video });
  const stopSession = attachSession(session, store, cfg, log);

  return {
    store,
    sessionId,
    async stop(reason = 'stopped') {
      await stopSession();
      unsubscribe();
      live?.sessionEnded(sessionId, { reason, photos: store.photoCount });
    },
  };
}
