const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { scanLibrary, readEvents, resolveInside, contentType, parseRange } = require('./library.cjs');

// Photos and videos are served to the page as media://local/<path inside the data folder>.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const defaultDataDir = path.resolve(__dirname, '..', '..', 'data'); // mentra-glasses-tool/data

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
  ipcMain.handle('library:reveal', (_e, relPath) => {
    const file = resolveInside(dataDir, String(relPath ?? ''), { anyType: true }) ?? dataDir;
    shell.showItemInFolder(file);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
