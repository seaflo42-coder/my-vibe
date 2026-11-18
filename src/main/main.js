'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, systemPreferences, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');
const { validateDeletion } = require('../core/safety');

let win = null;
let worker = null;
// 마지막 검사 결과에서 "지워도 되는 후보"로 나온 항목만 기억해 둔다 (삭제 허용 목록)
let lastScan = { roots: [], known: new Map(), dupGroups: [] };

const HOME = os.homedir();
const IS_MAC = process.platform === 'darwin';

// 사용자가 시스템 설정에서 고른 강조색 (예: 파랑, 보라, 초록 …)
function accentHex() {
  try {
    const c = systemPreferences.getAccentColor();
    return c ? '#' + c.slice(0, 6) : null;
  } catch {
    return null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    title: '말끔',
    // 맥에서는 제목 막대를 숨기고 신호등 버튼만 남기며, 사이드바 뒤로 바탕이 비치는 반투명 재질을 쓴다
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 19, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
      : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff' }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // 앱 안에서 외부 페이지로 이동하거나 새 창을 여는 일은 막는다
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function stopWorker() {
  if (worker) {
    worker.removeAllListeners();
    worker.terminate();
    worker = null;
  }
}

function rememberScan(result) {
  const known = new Map();
  for (const g of result.groups) for (const f of g.files) known.set(f.path, { size: f.size, mtimeMs: f.mtimeMs });
  for (const c of result.categories) {
    for (const i of c.items) known.set(i.path, { size: i.size, mtimeMs: i.mtimeMs, isDir: !!i.isDir });
  }
  lastScan = { roots: result.roots, known, dupGroups: result.groups };
}

ipcMain.handle('disk:info', async () => {
  try {
    const s = await fsp.statfs(HOME);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize, home: HOME, platform: process.platform };
  } catch {
    return { total: 0, free: 0, home: HOME, platform: process.platform };
  }
});

ipcMain.handle('dialog:pickFolders', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '검사할 폴더 선택',
    buttonLabel: '이 폴더 검사',
    defaultPath: HOME,
    properties: ['openDirectory', 'multiSelections'],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('scan:start', (_e, opts = {}) => {
  stopWorker();
  const roots = Array.isArray(opts.roots) ? opts.roots.filter((r) => typeof r === 'string' && path.isAbsolute(r)) : [];
  const minDupSize = Number(opts.minDupSize) > 0 ? Number(opts.minDupSize) : 1000 * 1000;
  worker = new Worker(path.join(__dirname, 'scan-worker.js'), { workerData: { home: HOME, roots, minDupSize } });
  worker.on('message', (m) => {
    if (m.type === 'progress') send('scan:progress', m.data);
    else if (m.type === 'done') {
      worker = null;
      if (m.data) rememberScan(m.data);
      send('scan:done', m.data);
    } else if (m.type === 'error') {
      worker = null;
      send('scan:error', m.data);
    }
  });
  worker.on('error', (e) => { worker = null; send('scan:error', String(e.message || e)); });
  return true;
});

ipcMain.handle('scan:cancel', () => { stopWorker(); return true; });

ipcMain.handle('files:trash', async (_e, paths) => {
  if (!Array.isArray(paths)) return { trashed: [], failed: [], freed: 0 };
  const { ok, rejected } = await validateDeletion(paths, { home: HOME, ...lastScan });
  const trashed = [];
  const failed = [...rejected];
  let freed = 0;
  for (let i = 0; i < ok.length; i++) {
    const p = ok[i];
    try {
      await shell.trashItem(p);
      trashed.push(p);
      freed += lastScan.known.get(p).size;
      lastScan.known.delete(p);
    } catch {
      failed.push({ path: p, reason: '휴지통으로 옮기지 못했어요 (권한이 없거나 사용 중)' });
    }
    if (i % 5 === 0) send('trash:progress', { done: i + 1, total: ok.length });
  }
  return { trashed, failed, freed };
});

ipcMain.handle('files:reveal', (_e, p) => {
  if (typeof p === 'string' && lastScan.known.has(p)) shell.showItemInFolder(p);
  return true;
});

ipcMain.handle('trash:open', async () => {
  await shell.openPath(path.join(HOME, '.Trash'));
  return true;
});

ipcMain.handle('trash:empty', () => new Promise((resolve) => {
  if (process.platform !== 'darwin') return resolve({ ok: false, reason: '맥에서만 쓸 수 있어요' });
  execFile('/usr/bin/osascript', ['-e', 'tell application "Finder" to empty trash'], { timeout: 120000 }, (err) => {
    if (err) resolve({ ok: false, reason: 'Finder에 요청하지 못했어요. 휴지통을 직접 열어 비워주세요.' });
    else resolve({ ok: true });
  });
}));

ipcMain.handle('app:accent', () => (IS_MAC ? accentHex() : null));

ipcMain.handle('app:openPrivacySettings', async () => {
  if (process.platform === 'darwin') {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  }
  return true;
});

// 화면 맨 위 메뉴 막대 (한국어)
function buildMenu() {
  const template = [
    ...(IS_MAC ? [{
      label: '말끔',
      submenu: [
        { role: 'about', label: '말끔에 관하여' },
        { type: 'separator' },
        { role: 'hide', label: '말끔 가리기' },
        { role: 'hideOthers', label: '기타 가리기' },
        { role: 'unhide', label: '모두 보기' },
        { type: 'separator' },
        { role: 'quit', label: '말끔 종료' },
      ],
    }] : []),
    {
      label: '파일',
      submenu: [
        { label: '검사 시작', accelerator: 'CmdOrCtrl+R', click: () => send('menu:scan') },
        { type: 'separator' },
        { role: 'close', label: '윈도우 닫기' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'copy', label: '복사하기' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },
    {
      label: '윈도우',
      submenu: [
        { role: 'minimize', label: '최소화' },
        { role: 'zoom', label: '확대/축소' },
        { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  if (IS_MAC) systemPreferences.on('accent-color-changed', () => send('app:accent-changed', accentHex()));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { stopWorker(); app.quit(); });
