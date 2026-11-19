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

module.exports = { classifyFinderError, emptyTrashDir };
