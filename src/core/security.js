'use strict';
// 보안 점검: 맥의 기본 보호 기능이 켜져 있는지, 수상한 자동 실행 항목이 있는지 살핀다.
// 백신이 아니다. 악성코드를 찾아내거나 치료하지 않으며, "문제없음"이 안전을 보장하지도 않는다.

// 널리 알려진 애드웨어·가짜 정리 프로그램의 이름 조각 (자동 실행 항목 이름·경로에서 찾는다)
const KNOWN_BAD = ['mackeeper', 'zeobit', 'genieo', 'vsearch', 'conduit', 'spigot', 'adload', 'pirrit', 'bundlore', 'shlayer',
  'crossrider', 'installmac', 'mughthesec', 'advancedmaccleaner', 'advanced mac cleaner', 'macautofixer', 'mac auto fixer',
  'searchmine', 'weknow', 'chilltab', 'chill-tab', 'anysearch', 'tapufind', 'safefinder', 'searchbaron', 'searchmarquis',
  'mackeeperagent', 'macbooster', 'mac cleanup pro', 'maccleanuppro', 'smartmackeeper', 'mycouponsmart', 'operatormac', 'kuklorest'];

const on = (text, re) => (text ? re.test(text) : null);

/** 명령 결과 글자를 켜짐(true)/꺼짐(false)/알 수 없음(null)으로 읽는다. */
const parseGatekeeper = (t) => (t ? (/assessments enabled/i.test(t) ? true : /assessments disabled/i.test(t) ? false : null) : null);
const parseSip = (t) => (t ? (/status:\s*enabled/i.test(t) ? true : /status:\s*disabled/i.test(t) ? false : null) : null);
const parseFileVault = (t) => (t ? (/FileVault is On/i.test(t) ? true : /FileVault is Off/i.test(t) ? false : null) : null);
const parseFirewall = (t) => (t ? (/enabled|State = [12]/i.test(t) ? true : /disabled|State = 0/i.test(t) ? false : null) : null);
/** `profiles list` 결과에서 설치된 구성 프로파일 이름들. 없으면 빈 목록, 읽지 못하면 null. */
function parseProfiles(t) {
  if (!t) return null;
  if (/no configuration profiles/i.test(t)) return [];
  const ids = [...t.matchAll(/profileIdentifier:\s*(\S+)/g)].map((m) => m[1]);
  return ids.length ? ids : null; // 알아볼 수 없는 답은 "없음"으로 치지 않는다
}
/** `codesign -dv` 결과로 서명 상태를 가른다: signed(정식) · adhoc(임시) · none(없음) */
function parseSignature(t) {
  const s = String(t || '');
  if (/not signed at all/i.test(s)) return 'none';
  if (/Signature=adhoc/i.test(s)) return 'adhoc';
  if (/TeamIdentifier=[A-Z0-9]{10}/.test(s) || /Authority=/.test(s)) return 'signed';
  return null;
}

/** 자동 실행 항목 가운데 수상한 것을 고른다. */
function suspiciousLaunchItems(items) {
  const out = [];
  for (const it of items) {
    const hay = `${it.label || ''} ${it.program || ''} ${it.name || ''}`.toLowerCase();
    const bad = KNOWN_BAD.find((k) => hay.includes(k));
    const p = String(it.program || '');
    let reason = null;
    if (bad) reason = '알려진 애드웨어·가짜 정리 프로그램의 이름과 같아요';
    else if (/^\/(private\/)?tmp\//.test(p) || /^\/Users\/Shared\//.test(p)) reason = '임시 폴더나 공유 폴더에 있는 프로그램을 실행해요';
    else if (/\/\.[^/]+\//.test(p.replace(/^\/Users\/[^/]+\/Library\//, '/'))) reason = '숨김 폴더 안의 프로그램을 실행해요';
    if (reason) out.push({ ...it, reason });
  }
  return out;
}

/**
 * 점검 결과 목록. status: good · warn · bad · info
 * 값을 읽지 못한 항목(null)은 목록에 넣지 않는다 — 모르는 것을 "문제없음"으로 보이게 하지 않기 위해서다.
 */
function securityChecks({ gatekeeper, sip, fileVault, firewall, profiles, suspicious, unsigned }) {
  const out = [];
  if (gatekeeper != null) {
    out.push({ id: 'gatekeeper', title: '출처 확인 (Gatekeeper)', status: gatekeeper ? 'good' : 'bad', value: gatekeeper ? '켜짐' : '꺼짐',
      advice: gatekeeper ? '확인되지 않은 앱을 열 때 맥이 한 번 막아 줘요.' : '꺼져 있으면 아무 앱이나 경고 없이 실행돼요. 켜 두는 것을 권해요.' });
  }
  if (sip != null) {
    out.push({ id: 'sip', title: '시스템 보호 (SIP)', status: sip ? 'good' : 'bad', value: sip ? '켜짐' : '꺼짐',
      advice: sip ? '맥의 핵심 파일을 다른 프로그램이 바꾸지 못하게 막고 있어요.' : '꺼져 있으면 악성 프로그램이 시스템 파일을 바꿀 수 있어요.' });
  }
  if (suspicious) {
    out.push({ id: 'launch', title: '수상한 자동 실행 항목', status: suspicious.length ? 'bad' : 'good',
      value: suspicious.length ? `${suspicious.length}개 발견` : '없음',
      advice: suspicious.length ? '아래 항목을 확인해 보세요. 설치한 기억이 없다면 끄는 것을 권해요.' : '알려진 애드웨어 이름이나 수상한 위치의 항목을 찾지 못했어요.',
      items: suspicious.map((s) => ({ name: s.name, detail: s.reason, path: s.path })) });
  }
  if (profiles != null) {
    out.push({ id: 'profiles', title: '구성 프로파일', status: profiles.length ? 'warn' : 'good', value: profiles.length ? `${profiles.length}개 설치됨` : '없음',
      advice: profiles.length ? '회사나 학교에서 설치한 것이 아니라면 확인이 필요해요. 프로파일은 맥 설정을 통째로 바꿀 수 있어요.' : '설정을 몰래 바꾸는 프로파일이 없어요.',
      items: profiles.map((p) => ({ name: p, detail: '시스템 설정 → 개인정보 보호 및 보안 → 프로파일에서 확인' })), action: profiles.length ? 'openProfiles' : null });
  }
  if (fileVault != null) {
    out.push({ id: 'filevault', title: '디스크 암호화 (FileVault)', status: fileVault ? 'good' : 'info', value: fileVault ? '켜짐' : '꺼짐',
      advice: fileVault ? '맥을 잃어버려도 안의 파일을 읽을 수 없어요.' : '켜 두면 맥을 잃어버렸을 때 파일이 보호돼요. 노트북이라면 권해요.' });
  }
  if (firewall != null) {
    out.push({ id: 'firewall', title: '방화벽', status: firewall ? 'good' : 'info', value: firewall ? '켜짐' : '꺼짐',
      advice: firewall ? '밖에서 들어오는 연결을 걸러 주고 있어요.' : '카페 같은 공용 와이파이를 자주 쓴다면 켜 두는 것을 권해요.' });
  }
  if (unsigned) {
    out.push({ id: 'unsigned', title: '서명이 없는 앱', status: unsigned.length ? 'info' : 'good', value: unsigned.length ? `${unsigned.length}개` : '없음',
      advice: unsigned.length ? '만든 곳을 애플이 확인하지 않은 앱이에요. 직접 믿고 설치한 앱이라면 괜찮아요.' : '설치된 앱이 모두 서명돼 있어요.',
      items: unsigned.map((u) => ({ name: u.name, detail: u.kind === 'none' ? '서명 없음' : '임시 서명' })) });
  }
  return out;
}

module.exports = { KNOWN_BAD, parseGatekeeper, parseSip, parseFileVault, parseFirewall, parseProfiles, parseSignature, suspiciousLaunchItems, securityChecks };
