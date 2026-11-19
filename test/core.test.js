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

test('폴더 크기 계산', async () => {
  const { size } = await dirSize(path.join(home, 'Library/Caches/com.example.app'));
  assert.strictEqual(size, 2 * MB);
});
