// Starts and stops the recorder (or the demo) and the video receiver from the app,
// and keeps the last lines they print.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MAX_LOG = 300;
const SCRIPTS = { receiver: 'src/receiver.mjs', glasses: 'src/server.mjs', demo: 'src/demo.mjs' };
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function createProcessManager({ toolDir, onUpdate, node = 'node' }) {
  const children = { recorder: null, video: null };
  const status = {
    recorder: { running: false, mode: null, exitCode: null },
    video: { running: false, exitCode: null },
  };
  const log = [];

  const emit = (msg) => onUpdate?.(msg);
  function addLog(source, text) {
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.replace(ANSI, '').trimEnd();
      if (!line.trim()) continue;
      const entry = { time: Date.now(), source, line: line.slice(0, 500) };
      log.push(entry);
      if (log.length > MAX_LOG) log.shift();
      emit({ type: 'log', entry });
    }
  }

  function run(name, label, cmd, args, env) {
    const child = spawn(cmd, args, { cwd: toolDir, env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    children[name] = child;
    status[name] = { ...status[name], running: true, exitCode: null };
    emit({ type: 'proc', status });
    child.stdout.on('data', (d) => addLog(label, d));
    child.stderr.on('data', (d) => addLog(label, d));
    child.on('error', (err) => addLog(label, `could not start: ${err.message}`));
    child.on('exit', (code, signal) => {
      if (children[name] === child) children[name] = null;
      status[name] = { ...status[name], running: false, exitCode: code };
      addLog(label, `stopped (${code ?? signal})`);
      emit({ type: 'proc', status });
    });
  }

  return {
    snapshot: () => ({ status, log: [...log] }),

    /**
     * mode 'receiver' = take photos and videos straight from the glasses over Wi-Fi;
     * 'glasses' = the cloud recorder (MentraOS app + ngrok); 'demo' = pretend glasses.
     * video (also receive the live RTMP stream) for 'receiver' and 'glasses'.
     */
    start({ mode, video }) {
      if (children.recorder) return { ok: false, message: 'Already running.' };
      if (!SCRIPTS[mode]) return { ok: false, message: 'Unknown mode.' };
      if (mode === 'glasses') {
        if (!fs.existsSync(path.join(toolDir, 'node_modules', '@mentra', 'sdk'))) {
          addLog('viewer', `First run "npm install" in ${toolDir}.`);
          return { ok: false, message: 'npm install needed in mentra-glasses-tool' };
        }
        if (!fs.existsSync(path.join(toolDir, '.env'))) {
          addLog('viewer', 'No .env file: copy .env.example to .env and fill in PACKAGE_NAME and MENTRAOS_API_KEY.');
          return { ok: false, message: '.env missing' };
        }
      }
      status.recorder.mode = mode;
      const withVideo = mode !== 'demo' && video === true;
      if (withVideo) run('video', 'video', 'bash', ['scripts/record-video.sh'], {});
      run('recorder', mode, node, [SCRIPTS[mode]], { VIDEO: withVideo && mode === 'glasses' ? '1' : '0' });
      return { ok: true };
    },

    /** Ask nicely (Ctrl+C), then force after 4 seconds. */
    stop() {
      for (const child of Object.values(children)) {
        if (!child) continue;
        child.kill('SIGINT');
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }, 4000).unref();
      }
    },

    running: () => Boolean(children.recorder || children.video),
  };
}

module.exports = { createProcessManager };
