const { contextBridge, ipcRenderer } = require('electron');

// The only things the page may ask the app to do.
contextBridge.exposeInMainWorld('glasses', {
  scan: () => ipcRenderer.invoke('library:scan'),
  events: (sessionId) => ipcRenderer.invoke('library:events', sessionId),
  chooseFolder: () => ipcRenderer.invoke('library:choose'),
  reveal: (relPath) => ipcRenderer.invoke('library:reveal', relPath),
  useFolder: (dir) => ipcRenderer.invoke('library:use', dir),
  live: () => ipcRenderer.invoke('live:snapshot'),
  onLive: (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on('live', handler);
    return () => ipcRenderer.removeListener('live', handler);
  },
  startRecorder: (mode, video) => ipcRenderer.invoke('recorder:start', { mode, video }),
  stopRecorder: () => ipcRenderer.invoke('recorder:stop'),
});
