'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, systemPreferences, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');
const { validateDeletion } = require('../core/safety');
const { classifyFinderError, emptyTrashDir, finderTrashArgs, chunk } = require('../core/trash');

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
    width: 1160,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '말끔',
    // 맥에서는 제목 막대를 숨기고, 창 전체가 뒤의 바탕화면을 흐리게 비추는 유리 재질이 된다
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 20 }, vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000' }
      : { backgroundColor: '#15161d' }),
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

// 앱이 직접 옮기지 못한 항목을 Finder에게 대신 옮겨 달라고 부탁한다.
// 맥이 말끔의 접근을 막은 폴더라도 Finder는 옮길 수 있다. 실제로 사라졌는지는 하나씩 확인한다.
async function trashViaFinder(paths) {
  const moved = [];
  let why = null;
  if (!IS_MAC || !paths.length) return { moved, why: 'unsupported' };
  for (const part of chunk(paths, 150)) {
    const res = await new Promise((resolve) => {
      execFile('/usr/bin/osascript', finderTrashArgs(part), { timeout: 180000 }, (err, _out, stderr) => {
        resolve(err ? classifyFinderError(err, String(stderr || '')) : null);
      });
    });
    if (res) why = res;
    for (const p of part) {
      try { await fsp.lstat(p); } catch { moved.push(p); } // 원래 자리에 없으면 옮겨진 것
    }
    if (res === 'automation') break; // 권한이 없으면 나머지도 똑같이 실패한다
  }
  return { moved, why };
}

ipcMain.handle('files:trash', async (_e, paths) => {
  if (!Array.isArray(paths)) return { trashed: [], failed: [], freed: 0 };
  const { ok, rejected } = await validateDeletion(paths, { home: HOME, ...lastScan });
  const trashed = [];
  const failed = [...rejected];
  let freed = 0;
  let needsPermission = false;
  const markTrashed = (p) => {
    trashed.push(p);
    const k = lastScan.known.get(p);
    if (k) freed += k.size;
    lastScan.known.delete(p);
  };
  const blocked = []; // 앱이 직접 옮기지 못한 항목과 맥이 알려준 이유
  for (let i = 0; i < ok.length; i++) {
    const p = ok[i];
    try {
      await shell.trashItem(p);
      markTrashed(p);
    } catch (e) {
      blocked.push({ path: p, why: String((e && e.message) || '').replace(/\s+/g, ' ').slice(0, 140) });
    }
    if (i % 5 === 0) send('trash:progress', { done: i + 1, total: ok.length });
  }
  if (blocked.length) {
    // 맥이 말끔의 접근을 막은 경우: Finder에게 대신 옮겨 달라고 부탁한다
    const viaFinder = await trashViaFinder(blocked.map((b) => b.path));
    if (win) win.focus();
    const moved = new Set(viaFinder.moved);
    for (const b of blocked) {
      if (moved.has(b.path)) { markTrashed(b.path); continue; }
      needsPermission = true;
      const hint = viaFinder.why === 'automation'
        ? '맥이 말끔의 접근을 막고 있어요. 전체 디스크 접근 권한에서 Malkkeum을 켜 주세요'
        : b.why || '권한이 없거나 사용 중';
      failed.push({ path: b.path, reason: `휴지통으로 옮기지 못했어요 (${hint})` });
    }
  }
  // 옮긴 파일을 중복 묶음에서 빼고, 사본이 하나만 남은 묶음은 없앤다
  if (trashed.length) {
    const goneNow = (m) => trashed.some((t) => m === t || m.startsWith(t + path.sep));
    lastScan.dupGroups = lastScan.dupGroups
      .map((g) => ({ ...g, files: g.files.filter((f) => !goneNow(f.path)) }))
      .filter((g) => g.files.length > 1);
  }
  return { trashed, failed, freed, needsPermission };
});

ipcMain.handle('files:reveal', (_e, p) => {
  if (typeof p === 'string' && lastScan.known.has(p)) shell.showItemInFolder(p);
  return true;
});

// 파일의 실제 모습: 사진·문서는 미리보기 그림, 그 밖에는 맥이 쓰는 파일 아이콘
ipcMain.handle('files:thumb', async (_e, p, size) => {
  if (typeof p !== 'string' || !lastScan.known.has(p)) return null;
  const px = Math.min(640, Math.max(32, Number(size) || 72)); // 갤러리의 큰 미리보기는 더 크게
  if (IS_MAC) {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: px, height: px });
      if (!img.isEmpty()) return img.toDataURL();
    } catch { /* 미리보기를 만들 수 없는 종류 → 아이콘으로 */ }
  }
  try {
    const img = await app.getFileIcon(p, { size: px > 100 ? 'large' : 'normal' });
    return img.isEmpty() ? null : img.toDataURL();
  } catch {
    return null;
  }
});

// 맥의 훑어보기(Quick Look)로 내용을 확인
ipcMain.handle('files:preview', (_e, p) => {
  if (typeof p !== 'string' || !lastScan.known.has(p) || !win) return false;
  if (IS_MAC) { win.previewFile(p); return true; }
  return false;
});

ipcMain.handle('trash:open', async () => {
  await shell.openPath(path.join(HOME, '.Trash'));
  return true;
});

// Finder에 휴지통 비우기를 부탁한다. Finder를 앞으로 불러와야 "정말 비울까요?" 확인 창이 보인다.
function askFinderToEmptyTrash() {
  const script = ['tell application "Finder"', 'activate', 'with timeout of 280 seconds', 'empty trash', 'end timeout', 'end tell'];
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', script.flatMap((l) => ['-e', l]), { timeout: 300000 }, (err, _out, stderr) => {
      if (!err) return resolve({ ok: true });
      resolve({ ok: false, why: classifyFinderError(err, String(stderr || '')) });
    });
  });
}

const EMPTY_REASONS = {
  automation: '말끔이 Finder에 요청하도록 허용되어 있지 않아요.',
  timeout: 'Finder가 응답하지 않았어요. Finder에 확인 창이 떠 있는지 봐 주세요.',
  'finder-down': 'Finder가 실행 중이 아니에요.',
  unknown: 'Finder가 휴지통을 비우지 못했어요. 사용 중인 파일이 있을 수 있어요.',
};

ipcMain.handle('trash:empty', async () => {
  if (!IS_MAC) return { ok: false, why: 'unsupported', reason: '맥에서만 쓸 수 있어요' };
  const finder = await askFinderToEmptyTrash();
  if (finder.ok) { if (win) win.focus(); return { ok: true, via: 'finder' }; }
  if (win) win.focus();
  if (finder.why === 'cancelled') return { ok: false, why: 'cancelled', reason: 'Finder에서 취소했어요.' };
  // Finder를 쓸 수 없으면 휴지통 폴더를 직접 비운다 (전체 디스크 접근 권한이 있을 때만 가능)
  const direct = await emptyTrashDir(HOME);
  if (direct.ok) return { ok: true, via: 'direct', removed: direct.removed, failed: direct.failed };
  return { ok: false, why: finder.why, reason: EMPTY_REASONS[finder.why] || EMPTY_REASONS.unknown };
});

ipcMain.handle('app:openAutomationSettings', async () => {
  if (IS_MAC) await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
  return true;
});

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
        { label: '선택한 항목을 휴지통으로 이동', accelerator: 'CmdOrCtrl+Backspace', click: () => send('menu:trash') },
        { type: 'separator' },
        { role: 'close', label: '윈도우 닫기' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '찾기', accelerator: 'CmdOrCtrl+F', click: () => send('menu:find') },
        { type: 'separator' },
        { role: 'cut', label: '오려두기' },
        { role: 'copy', label: '복사하기' },
        { role: 'paste', label: '붙여넣기' },
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
  nativeTheme.themeSource = 'dark'; // 유리 위의 밝은 글자가 항상 잘 보이도록 어두운 재질로 고정
  buildMenu();
  createWindow();
  if (IS_MAC) systemPreferences.on('accent-color-changed', () => send('app:accent-changed', accentHex()));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { stopWorker(); app.quit(); });
