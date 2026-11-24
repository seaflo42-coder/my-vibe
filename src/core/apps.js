'use strict';
// 앱 탭의 두뇌: 설치된 앱, 앱과 함께 지울 관련 파일, 이미 지운 앱이 남긴 파일(찌꺼기)을 찾는다.
// 지우는 일은 하지 않는다. 무엇이 후보인지만 조심스럽게 고른다.
const fsp = require('fs/promises');
const path = require('path');

const DAY = 86400000;
const UNUSED_DAYS = 180;

/** 글자로 된 Info.plist에서 앱 식별 이름(번들 ID)과 표시 이름을 꺼낸다. */
function parseInfoPlistXml(text) {
  const s = String(text);
  const str = (key) => { const m = s.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)); return m ? m[1].trim() : null; };
  return { id: str('CFBundleIdentifier'), name: str('CFBundleDisplayName') || str('CFBundleName') };
}

/** `mdls -name kMDItemLastUsedDate -raw` 결과 → 시각(ms). 기록이 없으면 null. */
function parseMdlsDate(text) {
  const t = String(text || '').trim();
  if (!t || t === '(null)') return null;
  const ms = Date.parse(t.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) ([+-]\d{4})$/, '$1T$2$3'));
  return Number.isFinite(ms) ? ms : null;
}

/** "com.example.app"처럼 생긴 이름인지 (역방향 도메인 꼴, 마디가 셋 이상) */
function isBundleIdLike(name) {
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9_-]+){2,}$/.test(name);
}
/** 만든 곳을 나타내는 앞 두 마디: "com.google.Chrome" → "com.google" */
const vendorOf = (id) => String(id).toLowerCase().split('.').slice(0, 2).join('.');

/** 폴더 안의 .app을 찾는다 (바로 아래와 한 단계 아래 폴더까지). */
async function findAppBundles(dirs) {
  const out = [];
  const seen = new Set();
  const visit = async (dir, depth) => {
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.isSymbolicLink() || !e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name.endsWith('.app')) { if (!seen.has(p)) { seen.add(p); out.push(p); } } else if (depth < 1) await visit(p, depth + 1);
    }
  };
  for (const d of dirs) await visit(d, 0);
  return out;
}

/**
 * 앱 하나와 함께 지워도 되는 관련 파일 후보. 이름이 **정확히** 일치하는 것만 고른다.
 * (비슷한 이름까지 넓히면 다른 앱의 자료를 지울 수 있다)
 */
function relatedCandidates(home, app) {
  const lib = path.join(home, 'Library');
  const out = [];
  if (app.id) {
    out.push(
      path.join(lib, 'Caches', app.id), path.join(lib, 'Preferences', `${app.id}.plist`),
      path.join(lib, 'Saved Application State', `${app.id}.savedState`), path.join(lib, 'Containers', app.id),
      path.join(lib, 'HTTPStorages', app.id), path.join(lib, 'WebKit', app.id),
      path.join(lib, 'Application Support', app.id), path.join(lib, 'Logs', app.id),
    );
  }
  if (app.name && app.name.length >= 3) {
    out.push(path.join(lib, 'Application Support', app.name), path.join(lib, 'Logs', app.name), path.join(lib, 'Caches', app.name));
  }
  return [...new Set(out)];
}

// 앱이 자료를 남기는 곳들 (사용자 라이브러리 기준)
const RELATED_PLACES = ['Caches', 'Preferences', 'Containers', 'Application Scripts', 'HTTPStorages', 'WebKit',
  'Saved Application State', 'Application Support', 'Logs', 'Cookies', 'LaunchAgents'];
// 이름에서 꼬리(.plist 등)를 떼어 앱 식별 이름과 견줄 수 있게 한다
const stripTail = (n) => n.replace(/\.(plist|savedState|binarycookies)$/, '');

/** `codesign -dv` 결과에서 개발사 번호(TeamIdentifier)를 꺼낸다. 없으면 null. */
function parseTeamId(text) {
  const m = String(text || '').match(/TeamIdentifier=([A-Z0-9]{10})\b/);
  return m ? m[1] : null;
}

/**
 * 앱 하나와 함께 지워도 되는 관련 파일을, **왜 이 앱 것이라고 봤는지**와 함께 찾는다.
 *  - exact : 이름이 앱 식별 이름(또는 앱 이름)과 정확히 같음
 *  - prefix: 앱 식별 이름으로 시작함 (예: com.회사.앱.helper)
 *  - team  : 같은 개발사 묶음 보관함. 그 개발사의 다른 앱이 설치돼 있으면 건드리지 않는다
 *  - system: 시스템 전체에 설치된 것 (지울 때 맥이 암호를 물을 수 있음)
 * @param {object} o
 * @param {string} o.home
 * @param {{id:string|null,name:string,team?:string|null}} o.app
 * @param {string[]} [o.otherTeams] 설치된 다른 앱들의 개발사 번호
 * @param {string} [o.systemLib]   시스템 라이브러리 위치 (시험할 때 바꿔 넣는다)
 */
async function findRelated({ home, app, otherTeams = [], systemLib = '/Library' }) {
  const lib = path.join(home, 'Library');
  const found = new Map(); // 경로 → { path, why }
  const add = (p, why) => { if (!found.has(p)) found.set(p, { path: p, why }); };
  const list = async (dir) => { try { return await fsp.readdir(dir); } catch { return []; } };

  for (const sub of RELATED_PLACES) {
    for (const n of await list(path.join(lib, sub))) {
      const id = stripTail(n);
      const p = path.join(lib, sub, n);
      if (app.id && id === app.id) add(p, 'exact');
      else if (app.id && isBundleIdLike(app.id) && id.startsWith(app.id + '.')) add(p, 'prefix');
      else if (app.name && app.name.length >= 3 && n === app.name && ['Application Support', 'Logs', 'Caches'].includes(sub)) add(p, 'exact');
    }
  }
  // 같은 개발사 묶음 보관함: 그 개발사의 다른 앱이 하나도 없을 때만
  if (app.team && !otherTeams.includes(app.team)) {
    for (const n of await list(path.join(lib, 'Group Containers'))) {
      if (n.startsWith(app.team + '.')) add(path.join(lib, 'Group Containers', n), 'team');
    }
  }
  // 시스템 전체에 설치된 자동 실행 항목과 도우미
  if (app.id && isBundleIdLike(app.id)) {
    for (const sub of ['LaunchAgents', 'LaunchDaemons', 'PrivilegedHelperTools']) {
      for (const n of await list(path.join(systemLib, sub))) {
        const id = stripTail(n);
        if (id === app.id || id.startsWith(app.id + '.')) add(path.join(systemLib, sub, n), 'system');
      }
    }
  }
  return [...found.values()];
}

const LEFTOVER_PLACES = [
  ['Caches', '임시 파일'], ['Application Support', '앱 자료'], ['Containers', '앱 보관함'], ['Saved Application State', '창 상태'],
  ['HTTPStorages', '웹 저장소'], ['WebKit', '웹 저장소'], ['Preferences', '설정'],
];

/**
 * 이미 지운 앱이 남긴 것으로 보이는 항목을 찾는다. 확실한 것만 고르기 위한 규칙:
 *  - 이름이 "com.만든곳.앱" 꼴인 것만 본다 (일반 이름은 누구 것인지 알 수 없다)
 *  - 애플 것은 건드리지 않는다
 *  - 같은 곳(앞 두 마디)에서 만든 앱이 하나라도 설치돼 있으면 건드리지 않는다
 *    (예: 크롬이 깔려 있으면 com.google.* 는 모두 그대로 둔다)
 * @param {string} home
 * @param {string[]} installedIds 지금 설치된 모든 앱의 식별 이름
 */
async function findLeftovers(home, installedIds) {
  const vendors = new Set(installedIds.map(vendorOf));
  const lib = path.join(home, 'Library');
  const out = [];
  for (const [sub, where] of LEFTOVER_PLACES) {
    let names;
    try { names = await fsp.readdir(path.join(lib, sub)); } catch { continue; }
    for (const n of names) {
      const id = n.replace(/\.(plist|savedState)$/, '');
      if (!isBundleIdLike(id)) continue;
      const v = vendorOf(id);
      if (v === 'com.apple' || id.toLowerCase().startsWith('group.') || vendors.has(v)) continue;
      out.push({ path: path.join(lib, sub, n), id, where });
    }
  }
  return out;
}

/** 오래 안 쓴 앱인지: 사용 기록이 없거나 180일 넘게 열지 않음 */
function isUnused(lastUsed, now = Date.now()) {
  return lastUsed == null || now - lastUsed > UNUSED_DAYS * DAY;
}

/** 지워도 되는 앱 위치인지: 응용 프로그램 폴더(와 한 단계 아래) 안의 .app, 애플 앱과 말끔 자신은 제외 */
function canRemoveApp(appPath, home, app) {
  const p = path.resolve(appPath);
  if (!p.endsWith('.app')) return false;
  const roots = ['/Applications', path.join(home, 'Applications')];
  const inRoot = roots.some((r) => { const rel = path.relative(r, p); return rel && !rel.startsWith('..') && rel.split(path.sep).length <= 2; });
  if (!inRoot) return false;
  if (app && app.id && (vendorOf(app.id) === 'com.apple' || app.id === 'com.seaflo42.malkkeum')) return false;
  return true;
}

module.exports = { findRelated, parseTeamId, parseInfoPlistXml, parseMdlsDate, isBundleIdLike, vendorOf, findAppBundles, relatedCandidates, findLeftovers, isUnused, canRemoveApp, UNUSED_DAYS };
