'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runScan } = require('../src/core/scan');
const { validateDeletion } = require('../src/core/safety');
const { dirSize } = require('../src/core/walk');

const { makeHome, MB } = require('./fixture');

let home; let result;
test.before(async () => {
  home = makeHome();
  // 리눅스 테스트 환경에서는 '만든 날짜'를 과거로 돌릴 수 없어 수정/접근 날짜만 사용
  result = await runScan({ home, roots: [], minDupSize: MB, useBirthtime: false });
});
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

const rel = (p) => path.relative(home, p);

test('내용이 완전히 같은 파일만 중복으로 묶는다', () => {
  assert.strictEqual(result.groups.length, 2);
  const g = result.groups.map((x) => x.files.map((f) => rel(f.path)).sort());
  assert.deepStrictEqual(g.find((x) => x.length === 3), ['Desktop/report copy.bin', 'Documents/report.bin', 'Documents/sub/report (2).bin']);
  const two = g.find((x) => x.length === 2);
  // 하드링크는 사본으로 세지 않는다
  assert.strictEqual(two.length, 2);
  assert.ok(two.includes('Movies/photo-dup.bin'));
  assert.strictEqual(result.summary.dupWasted, 2 * MB * 2 + 2 * MB);
});

test('원본 추정: 사본 표시가 없는 파일을 남길 파일로 고른다', () => {
  const { pickOriginal } = require('../src/core/duplicates');
  const g = result.groups.find((x) => x.files.length === 3);
  assert.strictEqual(rel(g.keep), 'Documents/report.bin');
  const pick = (names) => pickOriginal(names.map((n, i) => ({ path: n, mtimeMs: i }))).path;
  assert.strictEqual(pick(['/u/Downloads/a.pdf', '/u/Documents/a.pdf']), '/u/Documents/a.pdf');
  assert.strictEqual(pick(['/u/Documents/보고서 복사본.hwp', '/u/Documents/보고서.hwp']), '/u/Documents/보고서.hwp');
  assert.strictEqual(pick(['/u/Pictures/IMG_0012.jpg', '/u/Pictures/IMG_0012 2.jpg']), '/u/Pictures/IMG_0012.jpg');
  assert.strictEqual(pick(['/u/a/x.mov', '/u/b/x.mov']), '/u/a/x.mov'); // 구분이 안 되면 더 오래된 쪽
});

test('앱·사진 보관함·숨김·Library·링크 안쪽은 중복 후보에 넣지 않는다', () => {
  const all = result.groups.flatMap((x) => x.files.map((f) => rel(f.path)));
  for (const bad of ['Foo.app', 'photoslibrary', '.hidden', 'node_modules', 'Desktop/link.bin', 'Library', 'almost', 'small']) {
    assert.ok(!all.some((p) => p.includes(bad)), `${bad} 가 포함됨`);
  }
});

test('정리 추천이 올바른 묶음으로 나온다', () => {
  const by = Object.fromEntries(result.categories.map((c) => [c.id, c]));
  assert.strictEqual(by.trash.action, 'emptyTrash');
  assert.strictEqual(by.trash.total, 1 * MB);
  assert.deepStrictEqual(by.installers.items.map((i) => i.name), ['Installer.dmg']);
  assert.deepStrictEqual(by.caches.items.map((i) => i.name), ['com.example.app']);
  assert.deepStrictEqual(by.logs.items.map((i) => i.name), ['app.log']);
  // 브라우저 임시 파일: 캐시만 잡고 책갈피 같은 자료는 잡지 않는다
  assert.deepStrictEqual(by.browsers.items.map((i) => i.name).sort(), ['Chrome · 실행 캐시', 'Safari (예전 위치)']);
  assert.ok(by.browsers.items.every((i) => !i.path.includes('Bookmarks')));
  assert.strictEqual(by.browsers.safety, 'safe');
  assert.deepStrictEqual(by.mailDownloads.items.map((i) => i.name), ['A1B2']);
  assert.deepStrictEqual(by.oldDownloads.items.map((i) => i.name), ['old-thing.zip']);
  assert.deepStrictEqual(by.large.items.map((i) => i.name), ['big.mov']);
  assert.strictEqual(by.caches.safety, 'safe');
  assert.strictEqual(by.large.safety, 'review');
});

function ctx() {
  const known = new Map();
  for (const g of result.groups) for (const f of g.files) known.set(f.path, { size: f.size, mtimeMs: f.mtimeMs });
  for (const c of result.categories) for (const i of c.items) known.set(i.path, { size: i.size, mtimeMs: i.mtimeMs, isDir: !!i.isDir });
  return { home, roots: result.roots, known, dupGroups: result.groups };
}

test('안전 검사: 검사 결과에 없는 경로와 보호 폴더는 거부한다', async () => {
  const c = ctx();
  const prefs = path.join(home, 'Library/Preferences/keep.plist');
  const docs = path.join(home, 'Documents');
  c.known.set(docs, { size: 1, mtimeMs: 0, isDir: true }); // 허용 목록에 억지로 넣어도 막혀야 함
  const r = await validateDeletion([prefs, docs, '/etc/hosts', home, '../x'], c);
  assert.deepStrictEqual(r.ok, []);
  assert.strictEqual(r.rejected.length, 5);
});

test('안전 검사: 중복 묶음의 모든 사본을 지우려 하면 하나는 남긴다', async () => {
  const c = ctx();
  const g = result.groups.find((x) => x.files.length === 3);
  const r = await validateDeletion(g.files.map((f) => f.path), c);
  assert.strictEqual(r.ok.length, 2);
  assert.strictEqual(r.rejected.length, 1);
  const r2 = await validateDeletion(g.files.slice(1).map((f) => f.path), c);
  assert.strictEqual(r2.ok.length, 2);
  assert.strictEqual(r2.rejected.length, 0);
});

test('안전 검사: 폴더와 그 안 파일의 중복본을 함께 골라도 사본 하나는 남는다', async () => {
  const fs2 = require('fs');
  const dir = path.join(home, 'Downloads/old-folder');
  const inside = path.join(dir, 'inner/keep-me.bin');
  const outside = path.join(home, 'Documents/keep-me copy.bin');
  const other = path.join(home, 'Downloads/old-folder-2');
  const inside2 = path.join(other, 'keep-me.bin');
  const data = Buffer.alloc(2 * MB, 7);
  for (const f of [inside, outside, inside2]) { fs2.mkdirSync(path.dirname(f), { recursive: true }); fs2.writeFileSync(f, data); }
  const st = (f) => { const x = fs2.lstatSync(f); return { size: x.size, mtimeMs: x.mtimeMs }; };
  const known = new Map([[dir, { size: 2 * MB, mtimeMs: 0, isDir: true }], [other, { size: 2 * MB, mtimeMs: 0, isDir: true }],
    [inside, st(inside)], [outside, st(outside)], [inside2, st(inside2)]]);
  const group = { keep: inside, files: [{ path: inside }, { path: outside }, { path: inside2 }] };
  const c = { home, roots: [home], known, dupGroups: [group] };

  // 폴더(안에 사본 A) + 바깥 사본 B + 폴더2(안에 사본 C)를 모두 고른 경우
  const r = await validateDeletion([dir, outside, other], c);
  const gone = (f) => r.ok.some((d) => f === d || f.startsWith(d + path.sep));
  assert.strictEqual([inside, outside, inside2].filter((f) => !gone(f)).length, 1, '정확히 하나가 남아야 함');
  assert.strictEqual(r.rejected.length, 1);

  // 사본이 모두 폴더 안에만 있고 그 폴더들을 전부 고른 경우에도 하나는 남는다
  fs2.rmSync(outside);
  const r2 = await validateDeletion([dir, other], { ...c, dupGroups: [{ keep: inside, files: [{ path: inside }, { path: inside2 }] }] });
  assert.strictEqual(r2.ok.length, 1);
  assert.match(r2.rejected[0].reason, /남/);

  // 폴더 안의 파일을 따로 또 고르면 겹치는 요청은 하나로 합친다
  fs2.writeFileSync(outside, data);
  const r3 = await validateDeletion([dir, inside], { ...c, dupGroups: [] });
  assert.deepStrictEqual(r3.ok, [dir]);
  fs2.rmSync(dir, { recursive: true }); fs2.rmSync(other, { recursive: true }); fs2.rmSync(outside);
});

test('안전 검사: 사본이 하나만 남은 묶음은 더 이상 막지 않는다', async () => {
  const fs2 = require('fs');
  const a = path.join(home, 'Documents/lone/only.bin');
  const goneFile = path.join(home, 'Documents/lone/was-here.bin');
  fs2.mkdirSync(path.dirname(a), { recursive: true }); fs2.writeFileSync(a, 'x');
  const st = fs2.lstatSync(a);
  const known = new Map([[a, { size: st.size, mtimeMs: st.mtimeMs }], [path.dirname(a), { size: 1, mtimeMs: 0, isDir: true }]]);
  const groups = [{ keep: a, files: [{ path: a }, { path: goneFile }] }];
  // 남은 하나를 직접 고르거나, 그 파일이 든 폴더를 골라도 지울 수 있어야 한다
  assert.deepStrictEqual((await validateDeletion([a], { home, roots: [home], known, dupGroups: groups })).rejected, []);
  assert.deepStrictEqual((await validateDeletion([path.dirname(a)], { home, roots: [home], known, dupGroups: groups })).rejected, []);
  fs2.rmSync(path.dirname(a), { recursive: true });
});

test('안전 검사: 검사 뒤에 바뀐 파일은 지우지 않는다', async () => {
  const c = ctx();
  const p = path.join(home, 'Downloads/Installer.dmg');
  fs.appendFileSync(p, 'changed');
  const r = await validateDeletion([p], c);
  assert.deepStrictEqual(r.ok, []);
  assert.match(r.rejected[0].reason, /바뀌었/);
});

test('검사 도중 취소하면 결과 없이 끝난다', async () => {
  let n = 0;
  const r = await runScan({ home, roots: [], isCancelled: () => ++n > 3 });
  assert.strictEqual(r, null);
});

test('휴지통 비우기: 실패 원인을 가려내고, 휴지통 폴더만 직접 비운다', async () => {
  const { classifyFinderError, emptyTrashDir } = require('../src/core/trash');
  assert.strictEqual(classifyFinderError(new Error('x'), 'execution error: Not authorized to send Apple events to Finder. (-1743)'), 'automation');
  assert.strictEqual(classifyFinderError(new Error('x'), 'execution error: User canceled. (-128)'), 'cancelled');
  assert.strictEqual(classifyFinderError(Object.assign(new Error('x'), { killed: true }), ''), 'timeout');
  assert.strictEqual(classifyFinderError(new Error('x'), 'something else (-50)'), 'unknown');
  // Finder에 넘기는 경로는 스크립트 글자가 아니라 인자로만 전달된다
  const { finderTrashArgs, chunk } = require('../src/core/trash');
  const odd = '/Users/x/Downloads/이름 "따옴표" & $(위험).pptx';
  const args = finderTrashArgs([odd]);
  assert.strictEqual(args[args.length - 1], odd);
  assert.ok(!args.slice(0, args.indexOf('--')).some((a) => a.includes('따옴표')));
  // 항목마다 따로 시도하고, 권한 없음(-1743)만 바로 알린다
  const script = args.slice(0, args.indexOf('--')).filter((x) => x !== '-e').join('\n');
  assert.match(script, /repeat with p in argv[\s\S]*try[\s\S]*-1743[\s\S]*end try[\s\S]*end repeat/);
  assert.deepStrictEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

  const fs2 = require('fs');
  fs2.mkdirSync(path.join(home, '.Trash/folder/deep'), { recursive: true });
  fs2.writeFileSync(path.join(home, '.Trash/folder/deep/a.bin'), 'x');
  const before = fs2.readdirSync(path.join(home, 'Documents')).length;
  const r = await emptyTrashDir(home);
  assert.ok(r.ok);
  assert.ok(r.removed >= 2);
  assert.deepStrictEqual(fs2.readdirSync(path.join(home, '.Trash')), []);
  assert.strictEqual(fs2.readdirSync(path.join(home, 'Documents')).length, before, '휴지통 밖은 건드리지 않음');
  // 휴지통 폴더를 읽을 수 없으면(권한 없음) 실패로 알려준다
  const r2 = await emptyTrashDir(path.join(home, 'no-such-home'));
  assert.strictEqual(r2.ok, false);
});

test('최적화: 맥이 알려준 정보를 올바르게 읽는다', async () => {
  const o = require('../src/core/optimize');
  const ps = `  PID USER   %CPU    RSS COMM
  101 me     42.5 512000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  102 me     10.0 256000 /Applications/Google Chrome.app/Contents/Frameworks/X/Google Chrome Helper (Renderer)
  103 root    5.0 100000 /System/Library/CoreServices/WindowServer
  104 me      1.0  50000 /usr/bin/python3`;
  const g = o.parsePs(ps, 'me');
  const chrome = g.find((x) => x.name === 'Google Chrome');
  assert.strictEqual(chrome.cpu, 52.5);
  assert.strictEqual(chrome.count, 2);
  assert.strictEqual(chrome.canQuit, true);
  assert.strictEqual(g.find((x) => x.name === 'WindowServer').canQuit, false, '시스템 프로그램은 종료 불가');
  assert.strictEqual(g.find((x) => x.name === 'python3').canQuit, false, '앱이 아닌 것은 종료 버튼 없음');

  const bat = o.parseBattery(JSON.stringify({ SPPowerDataType: [{ sppower_battery_health_info: { sppower_battery_cycle_count: 412, sppower_battery_health: 'Good', sppower_battery_health_maximum_capacity: '87%' } }] }));
  assert.deepStrictEqual(bat, { cycles: 412, condition: 'Good', capacity: 87 });
  assert.strictEqual(o.parseBattery('{"SPPowerDataType":[{}]}'), null);
  assert.strictEqual(o.parseMemoryFree('System-wide memory free percentage: 23%'), 23);
  assert.strictEqual(o.parseSwapUsed('vm.swapusage: total = 4096.00M  used = 2048.00M  free = 2048.00M'), 2048 * 1024 * 1024);

  const checks = o.healthChecks({ disk: { total: 100, free: 5 }, uptimeSec: 20 * 86400, memFreePct: 12, swapUsed: 0, battery: { cycles: 900, condition: 'Service Recommended', capacity: 71 } });
  assert.deepStrictEqual(checks.map((c) => `${c.id}:${c.status}`), ['disk:bad', 'memory:bad', 'uptime:warn', 'battery:warn']);
  const fine = o.healthChecks({ disk: { total: 100, free: 60 }, uptimeSec: 3600, memFreePct: 70, swapUsed: 0, battery: null });
  assert.ok(fine.every((c) => c.status === 'good'));

  // 자동 실행 항목: 애플 기본 항목과 꺼진 항목은 빼고 읽는다
  const fs2 = require('fs');
  const dir = path.join(home, 'Library/LaunchAgents');
  const plist = (label, extra = '') => `<?xml version="1.0"?><plist><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/Applications/Example Updater.app/Contents/MacOS/updater</string></array><key>RunAtLoad</key><true/>${extra}</dict></plist>`;
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(path.join(dir, 'com.apple.thing.plist'), plist('com.apple.thing'));
  fs2.writeFileSync(path.join(dir, 'com.off.agent.plist'), plist('com.off.agent', '<key>Disabled</key><true/>'));
  const read = async (f) => o.parsePlistXml(fs2.readFileSync(f, 'utf8'));
  const items = await o.listLaunchItems(dir, read, 'user');
  assert.deepStrictEqual(items.map((i) => i.label), ['com.example.updater', 'com.mackeeper.agent']);
  assert.strictEqual(items[0].name, 'Example Updater');
  assert.strictEqual(o.friendlyName('com.google.keystone.agent', ''), 'Google Keystone');
  fs2.rmSync(path.join(dir, 'com.apple.thing.plist')); fs2.rmSync(path.join(dir, 'com.off.agent.plist'));
});

test('앱: 관련 파일은 이름이 정확히 같은 것만, 찌꺼기는 확실한 것만 고른다', async () => {
  const a = require('../src/core/apps');
  const fs2 = require('fs');
  assert.deepStrictEqual(a.parseInfoPlistXml(fs2.readFileSync(path.join(home, 'Applications/Old Tool.app/Contents/Info.plist'), 'utf8')), { id: 'com.example.oldtool', name: 'Old Tool' });
  assert.strictEqual(a.parseMdlsDate('(null)'), null);
  assert.strictEqual(a.parseMdlsDate('2026-03-01 10:22:33 +0000'), Date.UTC(2026, 2, 1, 10, 22, 33));
  assert.ok(a.isBundleIdLike('com.gone.ghostapp') && !a.isBundleIdLike('Google') && !a.isBundleIdLike('keep'));

  const bundles = await a.findAppBundles([path.join(home, 'Applications')]);
  assert.deepStrictEqual(bundles.map((b) => path.basename(b)).sort(), ['Foo.app', 'Old Tool.app']);

  const app = { id: 'com.example.oldtool', name: 'Old Tool' };
  const related = (await a.findRelated({ home, app })).map((r) => `${rel(r.path)} [${r.why}]`).sort();
  assert.deepStrictEqual(related, ['Library/Application Support/Old Tool [exact]', 'Library/Caches/com.example.oldtool [exact]', 'Library/Preferences/com.example.oldtool.plist [exact]']);

  // 넓힌 범위: 앱 이름으로 시작하는 것, 같은 개발사 묶음, 시스템 전체 항목
  const mk = (p) => { fs2.mkdirSync(path.dirname(p), { recursive: true }); fs2.writeFileSync(p, 'x'); };
  mk(path.join(home, 'Library/Containers/com.example.oldtool.helper/data'));
  mk(path.join(home, 'Library/Caches/com.example.oldtoolkit/data')); // 이름만 비슷한 다른 앱: 포함되면 안 됨
  mk(path.join(home, 'Library/Group Containers/ABCDE12345.oldtool/data'));
  mk(path.join(home, 'sys/LaunchDaemons/com.example.oldtool.daemon.plist'));
  const wide = await a.findRelated({ home, app: { ...app, team: 'ABCDE12345' }, systemLib: path.join(home, 'sys') });
  const why = Object.fromEntries(wide.map((r) => [path.basename(r.path), r.why]));
  assert.strictEqual(why['com.example.oldtool.helper'], 'prefix');
  assert.strictEqual(why['ABCDE12345.oldtool'], 'team');
  assert.strictEqual(why['com.example.oldtool.daemon.plist'], 'system');
  assert.strictEqual(why['com.example.oldtoolkit'], undefined, '이름이 비슷할 뿐인 다른 앱의 자료는 건드리지 않음');
  // 같은 개발사의 다른 앱이 설치돼 있으면 묶음 보관함은 그대로 둔다
  const shared = await a.findRelated({ home, app: { ...app, team: 'ABCDE12345' }, otherTeams: ['ABCDE12345'], systemLib: path.join(home, 'sys') });
  assert.ok(!shared.some((r) => r.why === 'team'));
  assert.strictEqual(a.parseTeamId('Identifier=x\nTeamIdentifier=ABCDE12345\nSealed'), 'ABCDE12345');
  assert.strictEqual(a.parseTeamId('TeamIdentifier=not set'), null);
  for (const p of ['Library/Containers/com.example.oldtool.helper', 'Library/Caches/com.example.oldtoolkit', 'Library/Group Containers', 'sys']) fs2.rmSync(path.join(home, p), { recursive: true });

  // 같은 곳에서 만든 앱(com.example.*)이 설치돼 있으면 그쪽 파일은 찌꺼기로 보지 않는다
  const left = await a.findLeftovers(home, ['com.example.oldtool']);
  assert.deepStrictEqual([...new Set(left.map((l) => l.id))], ['com.gone.ghostapp']);
  assert.strictEqual(left.length, 3);
  assert.ok(!left.some((l) => l.path.includes('com.apple.') || l.path.endsWith('keep.plist')));
  // 그 앱이 설치돼 있으면 하나도 나오지 않아야 한다
  assert.deepStrictEqual(await a.findLeftovers(home, ['com.example.oldtool', 'com.gone.other']), []);

  assert.strictEqual(a.isUnused(null), true);
  assert.strictEqual(a.isUnused(Date.now() - 10 * 86400000), false);
  assert.strictEqual(a.canRemoveApp(path.join(home, 'Applications/Old Tool.app'), home, app), true);
  assert.strictEqual(a.canRemoveApp('/Applications/Safari.app', home, { id: 'com.apple.Safari' }), false, '애플 앱은 지우지 않음');
  assert.strictEqual(a.canRemoveApp('/System/Applications/Mail.app', home, { id: 'x.y.z' }), false);
  assert.strictEqual(a.canRemoveApp(path.join(home, 'Documents/Thing.app'), home, app), false);
  assert.strictEqual(a.canRemoveApp('/Applications/Malkkeum.app', home, { id: 'com.seaflo42.malkkeum' }), false, '말끔 자신은 지우지 않음');
});

test('파일 종류: 확장자별로 모으고, 작은 파일도 빠뜨리지 않는다', () => {
  const t = result.types;
  assert.deepStrictEqual(t.ai, { count: 1, size: 200 * 1000 });
  assert.deepStrictEqual(t.eps, { count: 1, size: 20 * 1000 }, '100KB보다 작아도 찾아야 함');
  assert.strictEqual(t.psd.count, 1);
  assert.strictEqual(t.mp4.count, 1);
  assert.strictEqual(t.mov.count, 1);
  assert.strictEqual(t.zip.count, 2);
  assert.strictEqual(t.txt.count, 2);
  assert.strictEqual(t.bin, undefined, '목록에 없는 확장자는 모으지 않음');
  assert.deepStrictEqual(result.typeFiles.eps.map((f) => rel(f.path)), ['Documents/design/icon.eps']);
  // 앱·보관함·숨김·Library 안의 파일은 여기에도 나오지 않는다
  const all = Object.values(result.typeFiles).flat().map((f) => rel(f.path));
  assert.ok(!all.some((p) => p.startsWith('Library/') || p.includes('.app/') || p.startsWith('.')));
  const { extOf } = require('../src/core/filetypes');
  assert.strictEqual(extOf('/a/b/Photo.JPG'), 'jpg');
  assert.strictEqual(extOf('/a/.zshrc'), '');
  assert.strictEqual(extOf('/a/archive.tar.gz'), 'gz');
});

test('보안 점검: 맥의 답을 올바르게 읽고, 모르는 것은 문제없음으로 보이지 않는다', async () => {
  const sec = require('../src/core/security');
  assert.strictEqual(sec.parseGatekeeper('assessments enabled'), true);
  assert.strictEqual(sec.parseGatekeeper('assessments disabled'), false);
  assert.strictEqual(sec.parseGatekeeper(''), null);
  assert.strictEqual(sec.parseSip('System Integrity Protection status: enabled.'), true);
  assert.strictEqual(sec.parseSip('System Integrity Protection status: disabled.'), false);
  assert.strictEqual(sec.parseFileVault('FileVault is Off.'), false);
  assert.strictEqual(sec.parseFirewall('Firewall is enabled. (State = 1)'), true);
  assert.strictEqual(sec.parseFirewall('Firewall is disabled. (State = 0)'), false);
  assert.deepStrictEqual(sec.parseProfiles('There are no configuration profiles installed for user'), []);
  assert.deepStrictEqual(sec.parseProfiles('x[1] attribute: profileIdentifier: com.bad.profile\n'), ['com.bad.profile']);
  assert.strictEqual(sec.parseSignature('code object is not signed at all'), 'none');
  assert.strictEqual(sec.parseSignature('Signature=adhoc\nTeamIdentifier=not set'), 'adhoc');
  assert.strictEqual(sec.parseSignature('Authority=Developer ID Application: X\nTeamIdentifier=ABCDE12345'), 'signed');

  const sus = sec.suspiciousLaunchItems([
    { name: 'A', label: 'com.mackeeper.agent', program: '/Applications/MacKeeper.app/x' },
    { name: 'B', label: 'com.good.updater', program: '/Applications/Good.app/Contents/MacOS/u' },
    { name: 'C', label: 'com.x.y', program: '/private/tmp/run.sh' },
    { name: 'D', label: 'com.z.w', program: '/Users/me/.hidden/bin' },
    { name: 'E', label: 'com.google.keystone', program: '/Users/me/Library/Google/GoogleSoftwareUpdate/x' },
  ]);
  assert.deepStrictEqual(sus.map((x) => x.name), ['A', 'C', 'D']);

  // 읽지 못한 항목(null)은 결과에 넣지 않는다
  const none = sec.securityChecks({ gatekeeper: null, sip: null, fileVault: null, firewall: null, profiles: null, suspicious: null, unsigned: null });
  assert.deepStrictEqual(none, []);
  const some = sec.securityChecks({ gatekeeper: false, sip: true, fileVault: false, firewall: null, profiles: ['p'], suspicious: sus, unsigned: [] });
  assert.deepStrictEqual(some.map((c) => `${c.id}:${c.status}`), ['gatekeeper:bad', 'sip:good', 'launch:bad', 'profiles:warn', 'filevault:info', 'unsigned:good']);
});

test('폴더 크기 계산', async () => {
  const { size } = await dirSize(path.join(home, 'Library/Caches/com.example.app'));
  assert.strictEqual(size, 2 * MB);
});
