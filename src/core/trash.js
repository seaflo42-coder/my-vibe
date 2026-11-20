'use strict';
// 휴지통 비우기 보조 기능.
//  1) Finder에 부탁했을 때 왜 실패했는지 가려낸다 (사용자에게 정확히 안내하기 위해)
//  2) Finder를 쓸 수 없을 때, 휴지통 폴더 안의 항목을 직접 지운다
const fsp = require('fs/promises');
const path = require('path');

/** osascript가 남긴 오류를 사람이 조치할 수 있는 원인으로 분류한다. */
function classifyFinderError(err, stderr = '') {
  const text = `${stderr} ${(err && err.message) || ''}`;
  if (err && (err.killed || err.signal === 'SIGTERM')) return 'timeout';
  if (/-1743|not authori[sz]ed|Not allowed to send Apple events/i.test(text)) return 'automation'; // 자동화 권한 없음
  if (/-128\b|User cance/i.test(text)) return 'cancelled'; // Finder 확인 창에서 취소
  if (/-600\b|isn.t running|-10810/i.test(text)) return 'finder-down';
  return 'unknown';
}

/**
 * 휴지통 폴더 바로 아래 항목들을 완전히 지운다. 되돌릴 수 없으므로
 * 반드시 "<홈>/.Trash" 경로에만 동작하도록 확인한다.
 */
async function emptyTrashDir(home) {
  const trashDir = path.join(path.resolve(home), '.Trash');
  if (path.basename(trashDir) !== '.Trash' || path.dirname(trashDir) !== path.resolve(home)) {
    return { ok: false, code: 'EINVAL', removed: 0, failed: 0 };
  }
  let names;
  try {
    names = await fsp.readdir(trashDir);
  } catch (e) {
    // 맥은 '전체 디스크 접근 권한'이 없으면 휴지통 폴더를 읽지 못하게 막는다
    return { ok: false, code: e.code || 'EUNKNOWN', removed: 0, failed: 0 };
  }
  let removed = 0;
  let failed = 0;
  for (const name of names) {
    if (name === '.DS_Store') { await fsp.rm(path.join(trashDir, name), { force: true }).catch(() => {}); continue; }
    try {
      await fsp.rm(path.join(trashDir, name), { recursive: true, force: true });
      removed++;
    } catch {
      failed++;
    }
  }
  return { ok: failed === 0 || removed > 0, removed, failed };
}

// Finder에게 여러 항목을 휴지통으로 옮겨 달라고 부탁하는 스크립트.
// 경로는 스크립트 글자에 끼워 넣지 않고 인자로만 넘긴다 (이름에 따옴표 등이 있어도 안전하도록).
const FINDER_TRASH_SCRIPT = [
  'on run argv',
  'repeat with p in argv',
  'try',
  'set f to (POSIX file (p as text)) as alias',
  'with timeout of 20 seconds',
  'tell application "Finder" to delete f',
  'end timeout',
  'on error msg number n',
  // 자동화 권한이 없으면(-1743) 나머지도 똑같이 실패하므로 바로 멈추고 알린다
  'if n is -1743 then error msg number n',
  'end try',
  'end repeat',
  'end run',
];
function finderTrashArgs(paths) {
  return [...FINDER_TRASH_SCRIPT.flatMap((l) => ['-e', l]), '--', ...paths];
}
/** 목록을 n개씩 나눈다 (명령 한 번에 넘길 수 있는 길이에 한계가 있어서). */
function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

module.exports = { classifyFinderError, emptyTrashDir, finderTrashArgs, chunk };
