const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { scanLibrary, readEvents, resolveInside, contentType, parseRange } = require('./library.cjs');
const { connectLive, livePort } = require('./live-client.cjs');
const { createProcessManager } = require('./processes.cjs');

// Photos and videos are served to the page as media://local/<path inside the data folder>.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const toolDir = path.resolve(__dirname, '..', '..'); // mentra-glasses-tool
const defaultDataDir = path.join(toolDir, 'data');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
let dataDir = process.env.GLASSES_DATA_DIR || loadSettings().dataDir || defaultDataDir;

function saveDataDir(dir) {
  dataDir = dir;
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ dataDir: dir }));
  } catch { /* not remembered next time: fine */ }
}

async function serveMedia(request) {
  const url = new URL(request.url);
  const file = resolveInside(dataDir, decodeURIComponent(url.pathname.replace(/^\/+/, '')));
  if (!file) return new Response('not found', { status: 404 });
  let size;
  try { size = (await fs.promises.stat(file)).size; } catch { return new Response('not found', { status: 404 }); }
  const headers = { 'Content-Type': contentType(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = parseRange(request.headers.get('range'), size);
  if (range?.invalid) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  if (range) {
    const body = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end }));
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}

// ---- live link with the recorder ----
const live = { online: false, status: null, events: [] };
const sendAll = (payload) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('live', payload);
};
function onLiveMessage(msg) {
  if (msg.kind === 'status') live.status = msg;
  if (msg.kind === 'event') {
    live.events.push(msg);
    if (live.events.length > 200) live.events.shift();
  }
  sendAll({ type: 'message', msg });
}
function onLiveState(online) {
  live.online = online;
  if (!online) live.status = null;
  sendAll({ type: 'online', online });
}
let envText = '';
try { envText = fs.readFileSync(path.join(toolDir, '.env'), 'utf8'); } catch { /* no .env yet */ }
const port = livePort(envText);
const processes = createProcessManager({ toolDir, onUpdate: sendAll });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: '#111317',
    title: 'Glasses Viewer',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Links never open inside the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  protocol.handle('media', serveMedia);
  ipcMain.handle('library:scan', () => ({ ...scanLibrary(dataDir), exists: fs.existsSync(dataDir) }));
  ipcMain.handle('library:events', (_e, sessionId) => readEvents(dataDir, String(sessionId)));
  ipcMain.handle('library:choose', async (e) => {
    const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Choose the data folder of mentra-glasses-tool',
      defaultPath: dataDir,
      properties: ['openDirectory'],
    });
    if (!res.canceled && res.filePaths[0]) saveDataDir(res.filePaths[0]);
    return dataDir;
  });
  ipcMain.handle('library:use', (_e, dir) => {
    // Only used with the folder the recorder reports; it must be an existing folder.
    if (typeof dir === 'string' && path.isAbsolute(dir) && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) saveDataDir(dir);
    return dataDir;
  });
  ipcMain.handle('live:snapshot', () => ({ ...live, port, processes: processes.snapshot() }));
  ipcMain.handle('recorder:start', (_e, opts) => processes.start({ mode: opts?.mode, video: opts?.video === true }));
  ipcMain.handle('recorder:stop', () => processes.stop());
  connectLive({ port, onMessage: onLiveMessage, onState: onLiveState });
  ipcMain.handle('library:reveal', (_e, relPath) => {
    const file = resolveInside(dataDir, String(relPath ?? ''), { anyType: true }) ?? dataDir;
    shell.showItemInFolder(file);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Closing the app stops a recorder it started (a recorder started in a terminal keeps running).
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => processes.stop());
