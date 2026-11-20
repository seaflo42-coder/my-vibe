'use strict';
// 화면(렌더러)이 쓸 수 있는 기능을 꼭 필요한 것만 골라 건네준다.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  accent: () => ipcRenderer.invoke('app:accent'),
  onAccent: on('app:accent-changed'),
  onMenuScan: on('menu:scan'),
  onMenuTrash: on('menu:trash'),
  onMenuFind: on('menu:find'),
  diskInfo: () => ipcRenderer.invoke('disk:info'),
  pickFolders: () => ipcRenderer.invoke('dialog:pickFolders'),
  startScan: (opts) => ipcRenderer.invoke('scan:start', opts),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  trash: (paths) => ipcRenderer.invoke('files:trash', paths),
  reveal: (p) => ipcRenderer.invoke('files:reveal', p),
  thumb: (p, size) => ipcRenderer.invoke('files:thumb', p, size),
  preview: (p) => ipcRenderer.invoke('files:preview', p),
  openTrash: () => ipcRenderer.invoke('trash:open'),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),
  openPrivacySettings: () => ipcRenderer.invoke('app:openPrivacySettings'),
  openAutomationSettings: () => ipcRenderer.invoke('app:openAutomationSettings'),
  appsList: () => ipcRenderer.invoke('apps:list'),
  appsDetail: (appPath) => ipcRenderer.invoke('apps:detail', appPath),
  appsLeftovers: () => ipcRenderer.invoke('apps:leftovers'),
  appsTrash: (appPath, withRelated) => ipcRenderer.invoke('apps:trash', appPath, withRelated),
  appsTrashLeftovers: (paths) => ipcRenderer.invoke('apps:trashLeftovers', paths),
  optHealth: () => ipcRenderer.invoke('opt:health'),
  optProcesses: () => ipcRenderer.invoke('opt:processes'),
  optStartup: () => ipcRenderer.invoke('opt:startup'),
  optQuit: (name) => ipcRenderer.invoke('opt:quit', name),
  optDisable: (id) => ipcRenderer.invoke('opt:disable', id),
  openLoginSettings: () => ipcRenderer.invoke('opt:openLoginSettings'),
  onScanProgress: on('scan:progress'),
  onScanDone: on('scan:done'),
  onScanError: on('scan:error'),
  onTrashProgress: on('trash:progress'),
  onTrashNotice: on('trash:notice'),
});
