'use strict';
// 최적화 탭의 두뇌: 맥이 알려준 정보를 읽어 사람이 이해할 수 있는 점검 결과로 바꾼다.
// 명령을 직접 실행하지 않고 "결과 글자"만 해석하므로 맥이 아닌 곳에서도 시험할 수 있다.
const fsp = require('fs/promises');
const path = require('path');

const GB = 1000 * 1000 * 1000;
const DAY = 86400;

// 건드리면 맥이 불안정해지는 프로그램. 종료 버튼을 보여주지 않는다.
const PROTECTED = new Set(['kernel_task', 'launchd', 'WindowServer', 'loginwindow', 'Finder', 'Dock', 'SystemUIServer',
  'ControlCenter', 'NotificationCenter', 'Spotlight', 'mds', 'mds_stores', 'mdworker', 'coreaudiod', 'bluetoothd',
  'Malkkeum', 'Electron', 'cfprefsd', 'distnoted', 'trustd', 'securityd', 'opendirectoryd', 'powerd', 'configd']);

/** `ps -Aeo pid,user,pcpu,rss,comm` 결과를 앱 단위로 묶는다 (도우미 프로세스는 본체에 합친다). */
function parsePs(text, me) {
  const groups = new Map();
  for (const line of String(text).split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const [, pid, user, cpu, rssKb, comm] = m;
    // "/Applications/Google Chrome.app/Contents/..../Google Chrome Helper" → 앱 이름 "Google Chrome"
    const app = comm.match(/\/([^/]+)\.app\//);
    const base = comm.slice(comm.lastIndexOf('/') + 1);
    const name = app ? app[1] : base.replace(/ Helper.*$/, '');
    const g = groups.get(name) || { name, cpu: 0, mem: 0, pids: [], isApp: false, mine: true, count: 0 };
    g.cpu += Number(cpu);
    g.mem += Number(rssKb) * 1024;
    g.pids.push(Number(pid));
    g.count++;
    if (app) g.isApp = true;
    if (user !== me) g.mine = false;
    groups.set(name, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    cpu: Math.round(g.cpu * 10) / 10,
    // 사용자가 직접 연 앱만 종료를 요청할 수 있다
    canQuit: g.isApp && g.mine && !PROTECTED.has(g.name),
  }));
}

/** `system_profiler SPPowerDataType -json` 에서 배터리 상태를 꺼낸다. 배터리가 없으면 null. */
function parseBattery(jsonText) {
  try {
    const data = JSON.parse(jsonText).SPPowerDataType || [];
    for (const d of data) {
      const h = d.sppower_battery_health_info;
      if (!h) continue;
      const cap = parseInt(String(h.sppower_battery_health_maximum_capacity || ''), 10);
      return {
        cycles: Number(h.sppower_battery_cycle_count) || 0,
        condition: String(h.sppower_battery_health || ''),
        capacity: Number.isFinite(cap) ? cap : null,
      };
    }
  } catch { /* 해석 실패 → 배터리 정보 없음 */ }
  return null;
}

/** `memory_pressure` 결과의 "여유 비율"(0~100). 못 찾으면 null. */
function parseMemoryFree(text) {
  const m = String(text).match(/free percentage:\s*(\d+)%/i);
  return m ? Number(m[1]) : null;
}

/** `sysctl vm.swapusage` 결과에서 스왑 사용량(바이트). */
function parseSwapUsed(text) {
  const m = String(text).match(/used\s*=\s*([\d.]+)([MG])/i);
  if (!m) return null;
  return Number(m[1]) * (m[2].toUpperCase() === 'G' ? 1024 : 1) * 1024 * 1024;
}

/** 글자로 된 plist(XML)에서 필요한 값만 꺼낸다. (맥에서는 plutil로 JSON으로 바꿔 읽는 쪽을 먼저 쓴다) */
function parsePlistXml(text) {
  const s = String(text);
  const str = (key) => { const m = s.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)); return m ? m[1] : null; };
  const bool = (key) => { const m = s.match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`)); return m ? m[1] === 'true' : null; };
  const args = s.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  return {
    Label: str('Label'),
    Program: str('Program'),
    ProgramArguments: args ? [...args[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]) : [],
    RunAtLoad: bool('RunAtLoad'),
    Disabled: bool('Disabled'),
  };
}

/** "com.google.keystone.agent" 같은 이름을 사람이 알아볼 만한 이름으로 바꾼다. */
function friendlyName(label, program) {
  const app = program && program.match(/\/([^/]+)\.app\//);
  if (app) return app[1];
  const parts = String(label || '').split('.').filter((p) => p && !/^(com|org|net|io|co|kr|app|agent|helper|daemon|launcher|updater|plist)$/i.test(p));
  if (!parts.length) return label || '이름 없는 항목';
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/**
 * 자동 실행 폴더(LaunchAgents 등)에 든 항목을 읽는다.
 * @param {string} dir 폴더
 * @param {(file:string)=>Promise<object|null>} readPlist 파일 하나를 읽어 값을 돌려주는 함수
 * @param {'user'|'system'} scope user = 사용자가 직접 끌 수 있음, system = 시스템 설정에서 꺼야 함
 */
async function listLaunchItems(dir, readPlist, scope) {
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const n of names.sort()) {
    if (!n.endsWith('.plist') || n.startsWith('com.apple.')) continue; // 애플 기본 항목은 건드리지 않는다
    const file = path.join(dir, n);
    const p = await readPlist(file).catch(() => null);
    if (!p) continue;
    const program = p.Program || (p.ProgramArguments && p.ProgramArguments[0]) || '';
    const label = p.Label || n.replace(/\.plist$/, '');
    if (p.Disabled === true) continue;
    out.push({
      id: file, kind: 'agent', scope, path: file, label, program,
      name: friendlyName(label, program),
      detail: program ? program.replace(/^\/Users\/[^/]+/, '~') : label,
    });
  }
  return out;
}

/** 점검 결과 목록. status: good(문제 없음) · warn(살펴보면 좋음) · bad(조치 필요) */
function healthChecks({ disk, uptimeSec, memFreePct, swapUsed, battery }) {
  const out = [];
  if (disk && disk.total) {
    const pct = disk.free / disk.total;
    out.push({
      id: 'disk', title: '저장공간', value: `${Math.round(pct * 100)}% 남음`,
      status: pct < 0.1 ? 'bad' : pct < 0.2 ? 'warn' : 'good',
      advice: pct < 0.1 ? '여유 공간이 10%보다 적으면 맥이 눈에 띄게 느려져요. 저장공간 탭에서 정리해 보세요.'
        : pct < 0.2 ? '여유 공간이 줄어들고 있어요. 저장공간 탭에서 정리해 두면 좋아요.' : '여유 공간이 충분해요.',
      action: pct < 0.2 ? 'goHome' : null,
    });
  }
  if (memFreePct != null) {
    const heavySwap = swapUsed != null && swapUsed > 4 * GB;
    out.push({
      id: 'memory', title: '메모리', value: `${memFreePct}% 여유`,
      status: memFreePct < 15 ? 'bad' : memFreePct < 30 || heavySwap ? 'warn' : 'good',
      advice: memFreePct < 30 || heavySwap ? '메모리가 빠듯해요. 아래 목록에서 안 쓰는 무거운 프로그램을 종료해 보세요.' : '메모리 여유가 충분해요.',
    });
  }
  if (uptimeSec != null) {
    const days = Math.floor(uptimeSec / DAY);
    out.push({
      id: 'uptime', title: '마지막 재시동', value: days < 1 ? '오늘' : `${days}일 전`,
      status: days >= 14 ? 'warn' : 'good',
      advice: days >= 14 ? '2주 넘게 켜 두었어요. 한 번 재시동하면 쌓인 임시 상태가 정리돼요.' : '최근에 재시동했어요.',
    });
  }
  if (battery) {
    const worn = (battery.capacity != null && battery.capacity < 80) || /service|replace|poor|check/i.test(battery.condition);
    out.push({
      id: 'battery', title: '배터리', value: battery.capacity != null ? `최대 용량 ${battery.capacity}% · 충전 ${battery.cycles}회` : `충전 ${battery.cycles}회`,
      status: worn ? 'warn' : 'good',
      advice: worn ? '배터리가 많이 닳았어요. 사용 시간이 짧게 느껴지면 교체를 고려해 보세요.' : '배터리 상태가 좋아요.',
    });
  }
  return out;
}

module.exports = { parsePs, parseBattery, parseMemoryFree, parseSwapUsed, parsePlistXml, friendlyName, listLaunchItems, healthChecks, PROTECTED };
