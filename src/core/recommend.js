'use strict';
// "지워도 되는 것" 추천 목록을 만든다. 각 묶음에는 안전 등급이 붙는다.
//  - safe   : 지워도 다시 만들어지거나 더 이상 필요 없는 것
//  - review : 사용자가 직접 확인하고 골라야 하는 것
const fsp = require('fs/promises');
const path = require('path');
const { dirSize } = require('./walk');

const DAY = 24 * 60 * 60 * 1000;
const INSTALLER_EXTS = new Set(['.dmg', '.pkg', '.iso', '.xip', '.mpkg']);
const LARGE_FILE = 100 * 1000 * 1000;
const OLD_DAYS = 180;
const MIN_ITEM = 1000 * 1000;

async function listChildren(dir) {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true })).filter((e) => !e.isSymbolicLink());
  } catch {
    return [];
  }
}

async function sizedChildren(dir, { filter, isCancelled, minSize = MIN_ITEM } = {}) {
  const items = [];
  for (const ent of await listChildren(dir)) {
    if (isCancelled && isCancelled()) break;
    if (ent.name.startsWith('.')) continue;
    if (filter && !filter(ent.name)) continue;
    const p = path.join(dir, ent.name);
    const { size } = await dirSize(p, isCancelled);
    if (size < minSize) continue;
    let mtimeMs = 0;
    try { mtimeMs = (await fsp.lstat(p)).mtimeMs; } catch { /* ignore */ }
    items.push({ path: p, name: ent.name, size, mtimeMs, isDir: ent.isDirectory() });
  }
  return items.sort((a, b) => b.size - a.size);
}

function category(id, title, desc, safety, items, extra = {}) {
  return { id, title, desc, safety, items, total: items.reduce((n, i) => n + i.size, 0), ...extra };
}

/**
 * @param {object} o
 * @param {string} o.home  사용자 홈 폴더
 * @param {Array}  o.files walk()가 모은 파일 목록
 * @param {number} [o.now]
 */
async function buildRecommendations({ home, files, now = Date.now(), useBirthtime = true, onProgress, isCancelled }) {
  const cats = [];
  const used = new Set();
  const step = (label) => onProgress && onProgress({ label });
  const lib = path.join(home, 'Library');
  const downloads = path.join(home, 'Downloads');

  // 1) 휴지통
  step('휴지통');
  const trashDir = path.join(home, '.Trash');
  const trash = await dirSize(trashDir, isCancelled);
  const trashEntries = await listChildren(trashDir);
  if (trash.size > 0 || trashEntries.length > 0 || trash.denied) {
    cats.push(category('trash', '휴지통', '이미 버린 파일들이에요. 휴지통을 비워야 실제로 공간이 생겨요.', 'safe', [], {
      action: 'emptyTrash', total: trash.size, unknownSize: trash.denied && trash.size === 0,
    }));
  }

  // 2) 설치 파일
  step('설치 파일');
  const installers = files
    .filter((f) => INSTALLER_EXTS.has(path.extname(f.path).toLowerCase()) && !f.cloudOnly)
    .map((f) => ({ path: f.path, name: path.basename(f.path), size: f.size, mtimeMs: f.mtimeMs }))
    .sort((a, b) => b.size - a.size);
  installers.forEach((i) => used.add(i.path));
  if (installers.length) {
    cats.push(category('installers', '설치 파일', '앱을 설치할 때 내려받은 파일(.dmg, .pkg 등)이에요. 설치가 끝났다면 필요 없어요.', 'safe', installers));
  }

  // 3) 앱 캐시
  step('앱 임시 파일');
  const caches = await sizedChildren(path.join(lib, 'Caches'), {
    isCancelled, filter: (n) => !n.startsWith('com.apple.'),
  });
  if (caches.length) {
    cats.push(category('caches', '앱 임시 파일 (캐시)', '앱이 빠르게 열리려고 쌓아둔 임시 자료예요. 지워도 필요하면 앱이 다시 만들어요.', 'safe', caches));
  }

  // 4) 로그
  step('기록 파일');
  const logs = await sizedChildren(path.join(lib, 'Logs'), { isCancelled });
  if (logs.length) {
    cats.push(category('logs', '기록 파일 (로그)', '앱이 남긴 작동 기록이에요. 평소에는 볼 일이 없어요.', 'safe', logs));
  }

  // 5) 개발 도구 임시 파일
  step('개발 도구');
  const devItems = [];
  for (const rel of [
    'Developer/Xcode/DerivedData', 'Developer/Xcode/iOS DeviceSupport', 'Developer/CoreSimulator/Caches',
  ]) {
    const p = path.join(lib, rel);
    const { size } = await dirSize(p, isCancelled);
    if (size >= MIN_ITEM) devItems.push({ path: p, name: rel.split('/').slice(1).join(' / '), size, mtimeMs: 0, isDir: true });
  }
  if (devItems.length) {
    cats.push(category('dev', 'Xcode 임시 파일', 'Xcode가 만든 임시 자료예요. 지워도 다시 만들어져요.', 'safe', devItems));
  }

  // 6) 오래된 다운로드
  step('오래된 다운로드');
  const oldDl = [];
  const snapshot = new Map(files.filter((f) => path.dirname(f.path) === downloads).map((f) => [f.path, f]));
  for (const ent of await listChildren(downloads)) {
    if (isCancelled && isCancelled()) break;
    if (ent.name.startsWith('.')) continue;
    const p = path.join(downloads, ent.name);
    if (used.has(p)) continue;
    let st;
    try { st = await fsp.lstat(p); } catch { continue; }
    // 마지막으로 연 날짜는 검사 자체(파일 읽기) 때문에 갱신될 수 있으므로,
    // 파일은 검사 시작 때 적어 둔 값을 쓰고 폴더는 쓰지 않는다.
    const snap = snapshot.get(p);
    const atime = st.isDirectory() ? 0 : snap ? snap.atimeMs : st.atimeMs;
    // 만든 날짜도 본다: 방금 내려받았지만 수정 날짜만 옛날인 파일을 '오래됨'으로 오해하지 않도록
    const last = Math.max(st.mtimeMs, atime, useBirthtime ? st.birthtimeMs || 0 : 0);
    if (now - last < OLD_DAYS * DAY) continue;
    if (st.isFile() && st.size > 0 && st.blocks === 0) continue; // iCloud 전용
    const size = st.isDirectory() ? (await dirSize(p, isCancelled)).size : st.size;
    if (size < MIN_ITEM) continue;
    oldDl.push({ path: p, name: ent.name, size, mtimeMs: st.mtimeMs, isDir: st.isDirectory() });
  }
  oldDl.sort((a, b) => b.size - a.size);
  oldDl.forEach((i) => used.add(i.path));
  if (oldDl.length) {
    cats.push(category('oldDownloads', '오래된 다운로드', `다운로드 폴더에서 ${OLD_DAYS / 30}개월 넘게 손대지 않은 항목이에요.`, 'review', oldDl));
  }

  // 7) 아이폰/아이패드 백업
  step('기기 백업');
  const backups = await sizedChildren(path.join(lib, 'Application Support', 'MobileSync', 'Backup'), { isCancelled });
  if (backups.length) {
    cats.push(category('iosBackups', '아이폰·아이패드 백업', '이 맥에 저장된 기기 백업이에요. iCloud 백업을 쓰고 있거나 예전 기기라면 지워도 돼요.', 'review', backups));
  }

  // 8) 큰 파일
  step('큰 파일');
  const inOldDl = (p) => oldDl.some((d) => d.isDir && p.startsWith(d.path + path.sep));
  const large = files
    .filter((f) => f.size >= LARGE_FILE && !f.cloudOnly && !used.has(f.path) && !inOldDl(f.path))
    .sort((a, b) => b.size - a.size)
    .slice(0, 200)
    .map((f) => ({ path: f.path, name: path.basename(f.path), size: f.size, mtimeMs: f.mtimeMs }));
  if (large.length) {
    cats.push(category('large', '용량이 큰 파일', '100MB가 넘는 파일이에요. 더 이상 필요 없는 것만 골라서 지우세요.', 'review', large));
  }

  return cats;
}

module.exports = { buildRecommendations, LARGE_FILE, OLD_DAYS };
