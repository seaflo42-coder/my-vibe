'use strict';
// 삭제 요청을 실행하기 전에 거치는 마지막 안전 검사.
// 화면(렌더러)이 무엇을 보내든, 여기서 통과한 것만 휴지통으로 간다.
const fsp = require('fs/promises');
const path = require('path');

const SYSTEM_PREFIXES = ['/System', '/Library', '/usr', '/bin', '/sbin', '/private', '/etc', '/var', '/opt', '/Applications', '/cores', '/dev'];
const HOME_PROTECTED = ['Desktop', 'Documents', 'Downloads', 'Library', 'Movies', 'Music', 'Pictures', 'Public', 'Applications',
  'Library/Caches', 'Library/Logs', 'Library/Application Support', 'Library/Preferences', 'Library/Mobile Documents',
  'Library/Application Support/MobileSync', 'Library/Application Support/MobileSync/Backup', 'Library/Developer', 'Library/Developer/Xcode'];

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * @param {string[]} paths 지우려는 경로
 * @param {object} ctx
 * @param {string} ctx.home
 * @param {string[]} ctx.roots 검사했던 폴더
 * @param {Map<string,{size:number,mtimeMs:number,isDir?:boolean}>} ctx.known 검사 결과에 있던 항목
 * @param {Array<{files:Array<{path:string}>}>} ctx.dupGroups
 * @returns {Promise<{ok:string[], rejected:Array<{path:string,reason:string}>}>}
 */
async function validateDeletion(paths, { home, roots = [], known, dupGroups = [] }) {
  const ok = [];
  const rejected = [];
  const want = new Set();
  const protectedSet = new Set(HOME_PROTECTED.map((p) => path.join(home, p)));
  const scopes = [home, ...roots].map((r) => path.resolve(r));

  for (const raw of new Set(paths)) {
    const p = path.resolve(String(raw));
    const reject = (reason) => rejected.push({ path: p, reason });
    if (p !== raw) { reject('경로가 올바르지 않아요'); continue; }
    if (!known.has(p)) { reject('검사 결과에 없는 항목이에요'); continue; }
    if (!scopes.some((s) => isInside(p, s))) { reject('검사한 폴더 밖에 있어요'); continue; }
    if (protectedSet.has(p) || scopes.includes(p)) { reject('보호된 폴더예요'); continue; }
    if (!isInside(p, home) && SYSTEM_PREFIXES.some((s) => p === s || p.startsWith(s + '/'))) {
      reject('시스템 영역이에요'); continue;
    }
    let st;
    try { st = await fsp.lstat(p); } catch { reject('이미 없어졌어요'); continue; }
    if (st.isSymbolicLink()) { reject('바로가기(링크)는 지우지 않아요'); continue; }
    const k = known.get(p);
    if (st.isFile() && !k.isDir && (st.size !== k.size || st.mtimeMs !== k.mtimeMs)) {
      reject('검사 이후 내용이 바뀌었어요'); continue;
    }
    want.add(p);
  }

  // 중복 묶음의 모든 사본을 한꺼번에 지우는 일은 막는다: 살아남는 사본이 꼭 하나는 있어야 한다.
  for (const g of dupGroups) {
    const members = g.files.map((f) => f.path);
    if (!members.some((m) => want.has(m))) continue;
    let survivor = false;
    for (const m of members) {
      if (want.has(m)) continue;
      try { await fsp.access(m); survivor = true; break; } catch { /* 이미 없음 */ }
    }
    if (!survivor) {
      const keep = members.find((m) => want.has(m));
      want.delete(keep);
      rejected.push({ path: keep, reason: '같은 파일이 하나는 남아 있어야 해서 남겨뒀어요' });
    }
  }
  for (const p of want) ok.push(p);
  return { ok, rejected };
}

module.exports = { validateDeletion, isInside };
