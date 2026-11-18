'use strict';
// 화면(렌더러)이 쓸 수 있는 기능을 꼭 필요한 것만 골라 건네준다.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('api', {
  diskInfo: () => ipcRenderer.invoke('disk:info'),
  pickFolders: () => ipcRenderer.invoke('dialog:pickFolders'),
  startScan: (opts) => ipcRenderer.invoke('scan:start', opts),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  trash: (paths) => ipcRenderer.invoke('files:trash', paths),
  reveal: (p) => ipcRenderer.invoke('files:reveal', p),
  openTrash: () => ipcRenderer.invoke('trash:open'),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),
  openPrivacySettings: () => ipcRenderer.invoke('app:openPrivacySettings'),
  onScanProgress: on('scan:progress'),
  onScanDone: on('scan:done'),
  onScanError: on('scan:error'),
  onTrashProgress: on('trash:progress'),
});
