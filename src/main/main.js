'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, systemPreferences, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const { Worker } = require('worker_threads');
const { validateDeletion } = require('../core/safety');
const { classifyFinderError, emptyTrashDir, finderTrashArgs, chunk } = require('../core/trash');
const opt = require('../core/optimize');
const apps = require('../core/apps');
const { dirSize } = require('../core/walk');

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

/**
 * 항목들을 휴지통으로 옮긴다. 먼저 앱이 직접 옮겨 보고, 맥이 막으면 Finder에 대신 부탁한다.
 * (무엇을 옮겨도 되는지는 부르는 쪽에서 미리 검증해야 한다)
 */
async function moveToTrash(paths, onProgress) {
  const trashed = [];
  const failed = [];
  const blocked = []; // 앱이 직접 옮기지 못한 항목과 맥이 알려준 이유
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    try {
      await shell.trashItem(p);
      trashed.push(p);
    } catch (e) {
      blocked.push({ path: p, why: String((e && e.message) || '').replace(/\s+/g, ' ').slice(0, 140) });
    }
    if (onProgress && i % 5 === 0) onProgress(i + 1, paths.length);
  }
  let needsPermission = false;
  if (blocked.length) {
    const viaFinder = await trashViaFinder(blocked.map((b) => b.path));
    if (win) win.focus();
    const moved = new Set(viaFinder.moved);
    for (const b of blocked) {
      if (moved.has(b.path)) { trashed.push(b.path); continue; }
      needsPermission = true;
      const hint = viaFinder.why === 'automation'
        ? '맥이 말끔의 접근을 막고 있어요. 전체 디스크 접근 권한에서 Malkkeum을 켜 주세요'
        : b.why || '권한이 없거나 사용 중';
      failed.push({ path: b.path, reason: `휴지통으로 옮기지 못했어요 (${hint})` });
    }
  }
  return { trashed, failed, needsPermission };
}

ipcMain.handle('files:trash', async (_e, paths) => {
  if (!Array.isArray(paths)) return { trashed: [], failed: [], freed: 0 };
  const { ok, rejected } = await validateDeletion(paths, { home: HOME, ...lastScan });
  const moved = await moveToTrash(ok, (done, total) => send('trash:progress', { done, total }));
  const trashed = moved.trashed;
  const failed = [...rejected, ...moved.failed];
  const needsPermission = moved.needsPermission;
  let freed = 0;
  for (const p of trashed) {
    const k = lastScan.known.get(p);
    if (k) freed += k.size;
    lastScan.known.delete(p);
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
  if (typeof p === 'string' && (lastScan.known.has(p) || lastApps.has(p) || lastLeftovers.has(p))) shell.showItemInFolder(p);
  return true;
});

// 파일의 실제 모습: 사진·문서는 미리보기 그림, 그 밖에는 맥이 쓰는 파일 아이콘
ipcMain.handle('files:thumb', async (_e, p, size) => {
  if (typeof p !== 'string' || !(lastScan.known.has(p) || lastApps.has(p))) return null;
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

// ---------- 최적화 ----------
// 명령을 실행해 결과 글자를 돌려준다. 실패하면 빈 글자 (없는 명령이거나 권한이 없는 경우).
function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? '' : String(out)));
  });
}
let lastProcs = new Map();   // 이름 → 마지막으로 보여준 프로그램 (종료 요청 검증용)
let lastStartup = new Map(); // id → 마지막으로 보여준 자동 실행 항목

ipcMain.handle('opt:health', async () => {
  let disk = null;
  try { const s = await fsp.statfs(HOME); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { /* 없음 */ }
  let memFreePct = Math.round((os.freemem() / os.totalmem()) * 100);
  let swapUsed = null;
  let battery = null;
  if (IS_MAC) {
    // 맥은 남는 메모리를 일부러 캐시로 채우므로, 맥이 직접 계산한 '여유 비율'을 쓴다
    const [mp, sw, bat] = await Promise.all([
      run('/usr/bin/memory_pressure', []), run('/usr/sbin/sysctl', ['vm.swapusage']),
      run('/usr/sbin/system_profiler', ['SPPowerDataType', '-json'], 20000),
    ]);
    const pct = opt.parseMemoryFree(mp);
    if (pct != null) memFreePct = pct;
    swapUsed = opt.parseSwapUsed(sw);
    battery = opt.parseBattery(bat);
  }
  return opt.healthChecks({ disk, uptimeSec: os.uptime(), memFreePct, swapUsed, battery });
});

ipcMain.handle('opt:processes', async () => {
  const out = await run('/bin/ps', ['-Aeo', 'pid,user,pcpu,rss,comm']);
  const groups = opt.parsePs(out, os.userInfo().username).filter((g) => !g.pids.includes(process.pid));
  lastProcs = new Map(groups.map((g) => [g.name, g]));
  const cores = os.cpus().length || 1;
  return { cores, totalMem: os.totalmem(), items: groups };
});

// 앱에게 "종료해 주세요"라고 정중히 요청한다. 저장 안 한 문서가 있으면 앱이 직접 물어본다. (강제 종료는 하지 않는다)
ipcMain.handle('opt:quit', async (_e, name) => {
  const g = lastProcs.get(name);
  if (!g || !g.canQuit) return { ok: false, reason: '종료할 수 없는 프로그램이에요' };
  if (!IS_MAC) return { ok: false, reason: '맥에서만 쓸 수 있어요' };
  const script = ['on run argv', 'tell application (item 1 of argv) to quit', 'end run'];
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', [...script.flatMap((l) => ['-e', l]), '--', g.name], { timeout: 20000 }, (err, _o, stderr) => {
      if (!err) return resolve({ ok: true });
      const why = classifyFinderError(err, String(stderr || ''));
      resolve({ ok: false, why, reason: why === 'automation' ? '말끔이 다른 앱에 요청하도록 허용되어 있지 않아요' : '앱이 응답하지 않았어요' });
    });
  });
});

async function readPlist(file) {
  if (IS_MAC) {
    // 맥의 plist는 사람이 읽을 수 없는 형식일 수 있어 plutil로 바꿔 읽는다
    const json = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
    if (json) { try { return JSON.parse(json); } catch { /* 아래 방법으로 */ } }
  }
  return opt.parsePlistXml(await fsp.readFile(file, 'utf8'));
}

ipcMain.handle('opt:startup', async () => {
  const items = [];
  if (IS_MAC) {
    // 로그인 항목: 맥을 켜면 함께 열리는 앱
    const script = ['tell application "System Events"', 'set out to ""', 'repeat with li in login items',
      'set out to out & (name of li) & "\t" & (path of li) & "\n"', 'end repeat', 'return out', 'end tell'];
    const out = await run('/usr/bin/osascript', script.flatMap((l) => ['-e', l]), 20000);
    for (const line of out.split('\n')) {
      const [name, p] = line.split('\t');
      if (name && name.trim()) items.push({ id: 'login:' + name.trim(), kind: 'login', scope: 'user', name: name.trim(), detail: (p || '').trim().replace(/^\/Users\/[^/]+/, '~') });
    }
  }
  items.push(...await opt.listLaunchItems(path.join(HOME, 'Library', 'LaunchAgents'), readPlist, 'user'));
  if (IS_MAC) {
    items.push(...await opt.listLaunchItems('/Library/LaunchAgents', readPlist, 'system'));
    items.push(...await opt.listLaunchItems('/Library/LaunchDaemons', readPlist, 'system'));
  }
  lastStartup = new Map(items.map((i) => [i.id, i]));
  return items;
});

// 자동 실행 끄기. 설정 파일을 휴지통으로 옮기므로, 다시 켜려면 휴지통에서 꺼내면 된다.
ipcMain.handle('opt:disable', async (_e, id) => {
  const it = lastStartup.get(id);
  if (!it || it.scope !== 'user') return { ok: false, reason: '여기서 끌 수 없는 항목이에요' };
  if (it.kind === 'login') {
    if (!IS_MAC) return { ok: false, reason: '맥에서만 쓸 수 있어요' };
    const script = ['on run argv', 'tell application "System Events" to delete login item (item 1 of argv)', 'end run'];
    return new Promise((resolve) => {
      execFile('/usr/bin/osascript', [...script.flatMap((l) => ['-e', l]), '--', it.name], { timeout: 20000 }, (err) => {
        if (!err) lastStartup.delete(id);
        resolve(err ? { ok: false, reason: '로그인 항목을 지우지 못했어요. 시스템 설정에서 꺼 주세요.' } : { ok: true });
      });
    });
  }
  const dir = path.join(HOME, 'Library', 'LaunchAgents');
  if (path.dirname(it.path) !== dir || !it.path.endsWith('.plist')) return { ok: false, reason: '여기서 끌 수 없는 항목이에요' };
  if (IS_MAC) await run('/bin/launchctl', ['bootout', `gui/${os.userInfo().uid}`, it.path]); // 지금 실행 중이면 멈춘다
  try {
    await shell.trashItem(it.path);
    lastStartup.delete(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `설정 파일을 휴지통으로 옮기지 못했어요 (${String((e && e.message) || '').slice(0, 100)})` };
  }
});

ipcMain.handle('opt:openLoginSettings', async () => {
  if (IS_MAC) await shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension');
  return true;
});

// ---------- 앱: 안 쓰는 앱 · 지운 앱의 찌꺼기 ----------
let lastApps = new Map();      // 경로 → 마지막으로 보여준 앱 (삭제 요청 검증용)
let lastLeftovers = new Map(); // 경로 → 마지막으로 보여준 찌꺼기

async function readAppInfo(appPath) {
  const file = path.join(appPath, 'Contents', 'Info.plist');
  let info = { id: null, name: null };
  try {
    const buf = await fsp.readFile(file);
    if (buf.subarray(0, 6).toString('latin1') === 'bplist') {
      // 사람이 읽을 수 없는 형식이면 맥의 도구로 필요한 값만 꺼낸다
      const get = (k) => run('/usr/bin/plutil', ['-extract', k, 'raw', '-o', '-', file]).then((v) => v.trim() || null);
      const [id, dn, n] = await Promise.all([get('CFBundleIdentifier'), get('CFBundleDisplayName'), get('CFBundleName')]);
      info = { id, name: dn || n };
    } else info = apps.parseInfoPlistXml(buf.toString('utf8'));
  } catch { /* Info.plist가 없는 앱 */ }
  return { id: info.id, name: info.name || path.basename(appPath, '.app') };
}
async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}
// 폴더 크기: 맥·리눅스 공통의 du로 빠르게 재고, 안 되면 직접 센다
async function sizeOf(p) {
  const out = await run('/usr/bin/du', ['-sk', p], 120000);
  const kb = parseInt(out, 10);
  if (Number.isFinite(kb)) return kb * 1024;
  return (await dirSize(p)).size;
}
const APP_DIRS = () => ['/Applications', path.join(HOME, 'Applications')];

// 1단계: 앱 이름과 관련 파일만 빠르게 모아 목록을 먼저 보여준다
ipcMain.handle('apps:list', async () => {
  const bundles = await apps.findAppBundles(APP_DIRS());
  const list = await mapLimit(bundles, 12, async (p) => {
    const info = await readAppInfo(p);
    // 애플 기본 앱과 말끔 자신은 목록에 넣지 않는다 (더 알아볼 필요도 없다)
    if (!apps.canRemoveApp(p, HOME, info)) return null;
    const related = [];
    for (const c of apps.relatedCandidates(HOME, info)) { try { await fsp.lstat(c); related.push(c); } catch { /* 없음 */ } }
    return { path: p, name: info.name, id: info.id, related };
  });
  const shown = list.filter(Boolean);
  lastApps = new Map(shown.map((a) => [a.path, a]));
  return shown;
});

// 2단계: 앱 하나의 마지막 사용일과 용량. 시간이 걸릴 수 있어 화면이 앱마다 따로 요청한다
ipcMain.handle('apps:detail', async (_e, appPath) => {
  const a = lastApps.get(appPath);
  if (!a) return null;
  let lastUsed = null;
  if (IS_MAC) lastUsed = apps.parseMdlsDate(await run('/usr/bin/mdls', ['-name', 'kMDItemLastUsedDate', '-raw', a.path], 5000));
  const size = await sizeOf(a.path);
  let relatedSize = 0;
  for (const r of a.related) relatedSize += await sizeOf(r);
  Object.assign(a, { lastUsed, size, relatedSize, unused: apps.isUnused(lastUsed) });
  return { lastUsed, size, relatedSize, unused: a.unused };
});

ipcMain.handle('apps:leftovers', async () => {
  // 지금 설치된 모든 앱(시스템 앱 포함)을 기준으로, 주인이 없는 것만 찾는다
  const bundles = await apps.findAppBundles([...APP_DIRS(), '/System/Applications', '/System/Library/CoreServices/Applications']);
  const ids = (await mapLimit(bundles, 8, (p) => readAppInfo(p))).map((i) => i.id).filter(Boolean);
  const found = await apps.findLeftovers(HOME, ids);
  const items = (await mapLimit(found, 4, async (f) => ({ ...f, size: await sizeOf(f.path) }))).filter((f) => f.size >= 50 * 1000);
  items.sort((a, b) => b.size - a.size);
  lastLeftovers = new Map(items.map((i) => [i.path, i]));
  return items;
});

ipcMain.handle('apps:trash', async (_e, appPath, withRelated) => {
  const a = lastApps.get(appPath);
  if (!a || !apps.canRemoveApp(a.path, HOME, a)) return { ok: false, reason: '지울 수 없는 앱이에요' };
  // 실행 중인 앱은 지우지 않는다
  const running = opt.parsePs(await run('/bin/ps', ['-Aeo', 'pid,user,pcpu,rss,comm']), os.userInfo().username)
    .some((g) => g.isApp && g.name === path.basename(a.path, '.app'));
  if (running) return { ok: false, reason: '앱이 실행 중이에요. 먼저 종료한 뒤 다시 시도해 주세요.' };
  const targets = [a.path, ...(withRelated ? a.related : [])];
  const res = await moveToTrash(targets);
  const appGone = res.trashed.includes(a.path);
  if (appGone) lastApps.delete(a.path);
  let freed = 0;
  if (appGone) freed += a.size || 0;
  if (withRelated) freed += res.trashed.filter((p) => p !== a.path).length === a.related.length ? (a.relatedSize || 0) : 0;
  return { ok: appGone, trashed: res.trashed.length, failed: res.failed, freed, needsPermission: res.needsPermission, reason: appGone ? null : (res.failed[0] && res.failed[0].reason) || '휴지통으로 옮기지 못했어요' };
});

ipcMain.handle('apps:trashLeftovers', async (_e, paths) => {
  if (!Array.isArray(paths)) return { trashed: [], failed: [], freed: 0 };
  const lib = path.join(HOME, 'Library') + path.sep;
  // 방금 보여준 찌꺼기 목록에 있고, 라이브러리 폴더 안에 있는 것만 옮긴다
  const okPaths = paths.filter((p) => typeof p === 'string' && lastLeftovers.has(p) && path.resolve(p) === p && p.startsWith(lib));
  const res = await moveToTrash(okPaths);
  let freed = 0;
  for (const p of res.trashed) { freed += lastLeftovers.get(p).size; lastLeftovers.delete(p); }
  return { trashed: res.trashed, failed: res.failed, freed, needsPermission: res.needsPermission };
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
