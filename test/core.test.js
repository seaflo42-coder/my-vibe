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

test('폴더 크기 계산', async () => {
  const { size } = await dirSize(path.join(home, 'Library/Caches/com.example.app'));
  assert.strictEqual(size, 2 * MB);
});
