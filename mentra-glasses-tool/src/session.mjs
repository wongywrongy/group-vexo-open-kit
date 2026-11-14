/**
 * Wire one glasses session (the object MentraOS hands to `onSession`) to a SessionStore.
 * Kept apart from the server so it can be tested with a pretend session.
 *
 * Returns an async `stop()` that releases everything.
 */
export function attachSession(session, store, cfg, log = console) {
  const off = []; // unsubscribe functions
  let timer = null;
  let busy = false; // photos take seconds over Bluetooth: never start one on top of another
  let stopped = false;
  let streaming = false;

  store.event('session_start', { capabilities: session.capabilities ?? null });

  async function takePhoto(reason) {
    if (busy || stopped) return;
    busy = true;
    try {
      const photo = await session.camera.requestPhoto({
        size: cfg.photoSize,
        compress: cfg.photoCompress,
        saveToGallery: false,
      });
      const name = await store.savePhoto(photo.buffer, photo.mimeType, {
        reason,
        requestId: photo.requestId,
        glassesTime: photo.timestamp instanceof Date ? photo.timestamp.getTime() : null,
      });
      log.log(`photo saved: ${name} (${photo.buffer.length} bytes)`);
    } catch (err) {
      store.event('photo_error', { reason, message: String(err?.message ?? err) });
      log.warn(`photo failed: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  }

  // What the glasses report by themselves. Raw accelerometer/gyro are NOT in this SDK:
  // only a coarse head up/down event is (see README).
  const ev = session.events;
  off.push(ev.onHeadPosition((e) => store.event('head_position', { position: e.position })));
  off.push(
    ev.onButtonPress((e) => {
      store.event('button', { buttonId: e.buttonId, pressType: e.pressType });
      if (e.pressType === 'short' && !cfg.video) void takePhoto('button');
    }),
  );
  off.push(ev.onTouchEvent((e) => store.event('touch', { gesture: e.gesture_name })));
  off.push(ev.onGlassesBattery((e) => store.event('battery', { level: e.level, charging: e.charging })));

  if (cfg.video) {
    off.push(
      session.camera.onStreamStatus((s) => {
        store.event('stream_status', { status: s.status, stats: s.stats ?? null, error: s.errorDetails ?? null });
        log.log(`video: ${s.status}${s.stats ? ` ${s.stats.fps} fps` : ''}${s.errorDetails ? ` (${s.errorDetails})` : ''}`);
      }),
    );
    session.camera
      .startStream({ rtmpUrl: cfg.rtmpUrl, video: cfg.videoConfig })
      .then(() => {
        streaming = true;
        store.event('stream_requested', { rtmpUrl: cfg.rtmpUrl });
      })
      .catch((err) => {
        store.event('stream_error', { message: String(err?.message ?? err) });
        log.warn(`video failed to start: ${err?.message ?? err}`);
      });
  }

  if (cfg.photoIntervalSec > 0) {
    void takePhoto('timer');
    timer = setInterval(() => void takePhoto('timer'), cfg.photoIntervalSec * 1000);
  }

  return async function stop() {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    for (const fn of off) {
      try {
        fn();
      } catch {
        /* already gone */
      }
    }
    if (streaming || cfg.video) {
      try {
        await session.camera.stopStream();
      } catch {
        /* the glasses may already have disconnected */
      }
    }
    store.event('session_end');
    await store.close();
  };
}
