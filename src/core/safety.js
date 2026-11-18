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
 * @param {Array<{keep?:string,files:Array<{path:string}>}>} ctx.dupGroups
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

  // 어떤 경로가 이번 요청으로 사라지는지: 직접 골랐거나, 고른 폴더 안에 들어 있거나.
  // (폴더를 고르면 그 안의 파일도 함께 휴지통으로 가므로 반드시 같이 따져야 한다)
  const coveredBy = (m) => {
    if (want.has(m)) return m;
    for (const w of want) if (isInside(m, w)) return w;
    return null;
  };
  const exists = async (m) => { try { await fsp.access(m); return true; } catch { return false; } };

  // 중복 묶음의 모든 사본을 한꺼번에 지우는 일은 막는다: 살아남는 사본이 꼭 하나는 있어야 한다.
  for (const g of dupGroups) {
    const members = g.files.map((f) => f.path);
    if (!members.some(coveredBy)) continue;
    const alive = [];
    for (const m of members) if (await exists(m)) alive.push(m);
    if (alive.some((m) => !coveredBy(m))) continue; // 요청과 무관하게 남는 사본이 있음
    if (!alive.length) continue;
    // 남길 사본을 고른다: 파일 하나만 빼면 되는 쪽을 먼저, 그다음 원본으로 추정된 파일
    const direct = alive.filter((m) => want.has(m));
    const pick = direct.find((m) => m === g.keep) || direct[0] || (alive.includes(g.keep) ? g.keep : alive[0]);
    const cover = coveredBy(pick);
    want.delete(cover);
    rejected.push({
      path: cover,
      reason: cover === pick ? '같은 파일이 하나는 남아 있어야 해서 남겨뒀어요' : '마지막으로 남은 사본이 이 폴더 안에 있어서 폴더를 남겨뒀어요',
    });
  }
  // 고른 폴더 안에 있는 항목을 따로 또 고른 경우, 폴더 하나로 합친다
  for (const p of [...want]) {
    for (const w of want) if (isInside(p, w)) { want.delete(p); break; }
  }
  for (const p of want) ok.push(p);
  return { ok, rejected };
}

module.exports = { validateDeletion, isInside };
