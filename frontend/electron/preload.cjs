const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  selectFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
});
