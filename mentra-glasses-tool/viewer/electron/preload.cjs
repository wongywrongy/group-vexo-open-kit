const { contextBridge, ipcRenderer } = require('electron');

// The only things the page may ask the app to do.
contextBridge.exposeInMainWorld('glasses', {
  scan: () => ipcRenderer.invoke('library:scan'),
  events: (sessionId) => ipcRenderer.invoke('library:events', sessionId),
  chooseFolder: () => ipcRenderer.invoke('library:choose'),
  reveal: (relPath) => ipcRenderer.invoke('library:reveal', relPath),
});
