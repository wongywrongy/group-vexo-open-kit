// Listens to the recorder's live feed (http://127.0.0.1:<port>/live) and reconnects by itself.
const http = require('node:http');

/** Feed it text as it arrives; it calls onMessage(obj) for each complete `data:` message. */
function createSseParser(onMessage) {
  let buf = '';
  return (text) => {
    buf += text.replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue; // comments and pings
      try {
        onMessage(JSON.parse(data));
      } catch {
        /* a broken message is skipped */
      }
    }
    if (buf.length > 1_000_000) buf = ''; // never grow without end
  };
}

/**
 * Stay connected to the feed. onState(true|false) when the recorder appears or goes away.
 * Returns stop().
 */
function connectLive({ port, onMessage, onState, retryMs = 1500 }) {
  let req = null;
  let timer = null;
  let stopped = false;
  let online = false;
  const setOnline = (v) => {
    if (v !== online) {
      online = v;
      onState(v);
    }
  };
  const retry = () => {
    setOnline(false);
    if (!stopped) timer = setTimeout(open, retryMs);
  };
  function open() {
    if (stopped) return;
    req = http.get({ host: '127.0.0.1', port, path: '/live', headers: { host: `127.0.0.1:${port}` } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return retry();
      }
      setOnline(true);
      res.setEncoding('utf8');
      const feed = createSseParser(onMessage);
      res.on('data', feed);
      res.on('end', retry);
      res.on('error', () => {});
    });
    req.on('error', retry);
  }
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    req?.destroy();
  };
}

/** LIVE_PORT from the tool's .env (only that line is read), else the environment, else 3001. */
function livePort(envFileText, env = process.env) {
  if (env.LIVE_PORT) return Number(env.LIVE_PORT) || 3001;
  const m = /^\s*LIVE_PORT\s*=\s*(\d+)\s*$/m.exec(envFileText ?? '');
  return m ? Number(m[1]) : 3001;
}

module.exports = { createSseParser, connectLive, livePort };
