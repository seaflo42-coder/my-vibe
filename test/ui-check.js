'use strict';
// 실제 앱을 띄워서 "검사 → 선택 → 휴지통으로 이동" 전체 흐름을 확인한다.
// 가짜 홈 폴더를 쓰므로 실제 파일은 건드리지 않는다.
//   실행: xvfb-run -a node test/ui-check.js [스크린샷 저장 폴더]
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { _electron: electron } = require('playwright-core');
const { makeHome } = require('./fixture');

(async () => {
  const shots = process.argv[2];
  const home = makeHome();
  const app = await electron.launch({
    // MALKKEUM_BIN을 주면 설치 파일과 같은 방식으로 포장된 앱을 띄워 확인한다
    executablePath: process.env.MALKKEUM_BIN || require('electron'),
    args: process.env.MALKKEUM_BIN ? ['--no-sandbox'] : [path.join(__dirname, '..'), '--no-sandbox'],
    env: { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, '.local/share') },
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize({ width: 1160, height: 800 });
    const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };

    await page.waitForSelector('#scanBtn');
    await page.waitForTimeout(700);
    await shot('1-home');
    await page.click('#scanBtn');
    await page.waitForSelector('.summary', { timeout: 60000 });
    await page.waitForTimeout(900);
    await shot('2-result');
    assert.ok(await page.locator('.treemap .tm').count() >= 4, '저장공간 지도에 블록이 있어야 함');
    assert.match(await page.locator('.totalrow .tv').innerText(), /최대/);
    await page.evaluate(() => { const m = document.getElementById('main'); m.scrollTop = m.scrollHeight; });
    await page.waitForTimeout(300);
    await shot('2b-total');
    await page.evaluate(() => { document.getElementById('main').scrollTop = 0; });

    // 지름길: 안전한 항목 한 번에 고르기 → 중복 사본 3 + 설치 파일 1 + 캐시 1 + 로그 1
    await page.click('#safeBtn');
    assert.match(await page.locator('#actionbar .info b').innerText(), /^9개/);
    await page.click('#actionbar >> text=선택 해제');
    assert.ok(await page.locator('#actionbar').isHidden());

    // 중복 파일: 추천대로 고르면 원본으로 보이는 파일만 남는다
    await page.click('.nav-item:has-text("중복 파일")');
    assert.strictEqual(await page.locator('.group').count(), 2);
    await page.click('button:has-text("추천대로 고르기")');
    assert.strictEqual(await page.locator('.row.picked').count(), 3);
    assert.match(await page.locator('.group').first().locator('.row:not(.picked) .name').innerText(), /Documents$/);
    await page.waitForTimeout(600);
    await shot('3-dups');
    // 마지막 남은 사본은 체크할 수 없어야 한다
    await page.locator('.group').first().locator('.row:not(.picked) input').click();
    assert.strictEqual(await page.locator('.row.picked').count(), 3);

    // 기준 줄: 이름을 누르면 이름순, 다시 누르면 반대로
    const titles = () => page.locator('.group .title').allInnerTexts();
    // (묶음 이름은 남길 파일에 따라 컴퓨터마다 다를 수 있어, 정해진 이름 대신 순서만 확인한다)
    await page.click('.headbar .sh.file');
    const asc = await titles();
    assert.deepStrictEqual(asc, [...asc].sort((x, y) => x.localeCompare(y, 'ko')));
    await page.click('.headbar .sh.file');
    assert.deepStrictEqual(await titles(), [...asc].reverse());
    await page.click('.headbar .sh.size');

    // 검색: 이름이나 폴더로 좁혀 본다
    await page.click('#searchBtn');
    await page.fill('#searchInput', 'photo');
    assert.strictEqual(await page.locator('.group').count(), 1);
    assert.match(await page.locator('#toolbar .sub').innerText(), /검색 결과 2개/);
    await page.fill('#searchInput', '없는이름');
    assert.ok(await page.locator('text=찾는 항목이 없어요').isVisible());
    await page.click('#searchClear');
    assert.strictEqual(await page.locator('.group').count(), 2);

    // 계층 보기: 묶음 → 항목 → 자세히. 여기서도 마지막 사본은 고를 수 없다
    await page.click('#viewSeg [data-mode="columns"]');
    assert.strictEqual(await page.locator('.browser.columns .col').count(), 3);
    assert.strictEqual(await page.locator('.col').nth(1).locator('.crow.picked').count(), 2);
    await page.locator('.col').nth(1).locator('.crow:not(.picked) input').click();
    assert.strictEqual(await page.locator('.col').nth(1).locator('.crow.picked').count(), 2);
    await page.keyboard.press('ArrowDown');
    assert.match(await page.locator('.detail .dname').innerText(), /report/);
    await page.waitForTimeout(4200);
    await shot('3b-columns');

    // 갤러리 보기: 큰 미리보기 + 아래 줄, 화살표로 이동
    await page.click('#viewSeg [data-mode="gallery"]');
    assert.strictEqual(await page.locator('.strip .cellthumb').count(), 5);
    assert.strictEqual(await page.locator('.strip .cellthumb.picked').count(), 3);
    const before = await page.locator('.strip-wrap .count').innerText();
    await page.keyboard.press('ArrowRight');
    assert.notStrictEqual(await page.locator('.strip-wrap .count').innerText(), before);
    await page.waitForTimeout(500);
    await shot('3c-gallery');
    await page.click('#viewSeg [data-mode="list"]');

    // 정리 추천
    await page.click('.nav-item:has-text("정리 추천")');
    await page.click('.cat-head:has-text("앱 임시 파일")');
    await page.locator('.cat:has-text("앱 임시 파일") .cat-tools input').check();
    assert.strictEqual(await page.locator('.cat.open .row.head .sh').count(), 4);
    assert.strictEqual(await page.locator('.cat.open .row:not(.head) .kind').first().innerText(), '폴더');
    await page.waitForTimeout(4200); // 안내 알림이 사라진 뒤 촬영
    await shot('4-reco');

    // 휴지통으로 이동 → 확인 창에 내역이 보인다
    await page.click('#trashBtn');
    assert.strictEqual(await page.locator('.modal li').count(), 2);
    await page.waitForTimeout(500);
    await shot('5-confirm');
    await page.click('.modal .btn.primary');
    await page.waitForSelector('.result:has-text("휴지통으로 옮겼어요")', { timeout: 30000 });
    assert.match(await page.locator('.stepper .now').innerText(), /비우기/);
    await page.waitForTimeout(700);
    await shot('6-done');
    assert.ok(fs.existsSync(path.join(home, 'Documents/report.bin')), '원본은 남아 있어야 함');
    assert.ok(!fs.existsSync(path.join(home, 'Desktop/report copy.bin')), '사본은 옮겨져야 함');
    assert.ok(!fs.existsSync(path.join(home, 'Documents/sub/report (2).bin')));
    assert.ok(!fs.existsSync(path.join(home, 'Library/Caches/com.example.app')), '캐시는 옮겨져야 함');
    assert.ok(fs.existsSync(path.join(home, 'Library/Caches/com.apple.Safari')), '시스템 캐시는 그대로');
    assert.ok(fs.existsSync(path.join(home, 'Library/Preferences/keep.plist')));
    await page.click('.nav-item:has-text("중복 파일")');
    assert.strictEqual(await page.locator('.group').count(), 0);
    // 파일 종류 탭: 확장자를 골라 찾고, 골라서 휴지통으로
    await page.click('.nav-item:has-text("파일 종류")');
    await page.waitForSelector('.typepick .tchip[data-ext="psd"]');
    assert.ok(await page.locator('.tchip[data-ext="eps"]').isVisible(), '작은 eps 파일도 찾아야 함');
    await page.click('.tchip[data-ext="psd"]');
    await page.click('.tchip[data-ext="eps"]');
    await page.click('.tchip[data-ext="ai"]');
    await page.waitForSelector('.typelist .row:not(.head)');
    assert.strictEqual(await page.locator('.typelist .row:not(.head)').count(), 3);
    assert.match(await page.locator('.typelist .row:not(.head) .name').first().innerText(), /poster\.psd/, '큰 순서로 정렬');
    await page.waitForTimeout(500);
    await shot('9-types');
    // 검색으로 좁히기 (앞에서 검색 칸을 열어 둔 상태면 그대로 쓴다)
    if (!(await page.locator('#searchBox.open').count())) await page.click('#searchBtn');
    await page.fill('#searchInput', 'logo');
    await page.waitForFunction(() => document.querySelectorAll('.typelist .row:not(.head)').length === 1);
    await page.click('#searchClear');
    await page.waitForFunction(() => document.querySelectorAll('.typelist .row:not(.head)').length === 3);
    // 모두 고르기 → 휴지통
    await page.click('#typeAll');
    assert.match(await page.locator('#actionbar .info b').innerText(), /^3개/);
    await page.waitForTimeout(400);
    await shot('9b-types-picked');
    await page.click('#trashBtn');
    await page.click('.modal .btn.primary');
    // 옮긴 뒤에도 파일 종류 탭에 그대로 머문다 (저장공간 화면으로 튀지 않음)
    await page.waitForSelector('.toast:has-text("3개 항목을 휴지통으로 옮겼어요")', { timeout: 30000 });
    assert.ok(await page.locator('.nav-item[aria-current="page"]:has-text("파일 종류"), .nav-item.on:has-text("파일 종류"), .nav-item.active:has-text("파일 종류")').count(), '파일 종류 탭에 머물러야 함');
    assert.ok(await page.locator('.browser.types').count(), '파일 종류 화면이 그대로 보여야 함');
    for (const f of ['logo.ai', 'poster.psd', 'icon.eps']) assert.ok(!fs.existsSync(path.join(home, 'Documents/design', f)), f + ' 는 옮겨져야 함');
    assert.ok(fs.existsSync(path.join(home, 'Movies/clip.mp4')), '고르지 않은 종류는 그대로');
    await page.click('.nav-item:has-text("파일 종류")');
    assert.strictEqual(await page.locator('.tchip[data-ext="psd"]').count(), 0, '옮긴 뒤에는 목록에서 사라짐');
    assert.ok(await page.locator('.tchip[data-ext="mp4"]').isVisible());

    // 앱 탭: 안 쓰는 앱과, 지운 앱이 남긴 파일
    await page.click('.nav-item:has-text("앱")');
    await page.waitForSelector('.applist .cell:has-text("Old Tool")', { timeout: 60000 });
    await page.waitForSelector('.leftovers .row', { timeout: 60000 });
    // 앱의 세부 정보(사용 기록·용량)가 채워질 때까지 기다린다.
    // (맥이 어떤 사용 기록을 돌려주든 통과하도록 '전체' 목록에서 확인한다)
    await page.click('.applist .seg button:has-text("전체")');
    const oldTool = page.locator('.applist .cell:has-text("Old Tool")');
    await oldTool.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const row = [...document.querySelectorAll('.applist .cell')].find((c) => c.textContent.includes('Old Tool'));
      return row && !row.textContent.includes('확인 중');
    }, null, { timeout: 120000 });
    console.log('앱 줄:', (await oldTool.innerText()).replace(/\n/g, ' | '));
    assert.strictEqual(await page.locator('.leftovers .row').count(), 2, '찌꺼기는 50KB 넘는 확실한 것만');
    assert.ok(!(await page.locator('.leftovers').innerText()).includes('com.example'), '설치된 앱과 같은 곳의 파일은 건드리지 않음');
    await page.waitForTimeout(600);
    await shot('8-apps');
    // 찌꺼기 정리
    await page.locator('.leftovers .cat-tools input').check();
    await page.click('#leftBtn');
    await page.click('.modal .btn.primary');
    await page.waitForSelector('.toast:has-text("남은 파일 2개")', { timeout: 20000 });
    assert.ok(!fs.existsSync(path.join(home, 'Library/Caches/com.gone.ghostapp')));
    assert.ok(fs.existsSync(path.join(home, 'Library/Caches/com.example.oldtool')), '설치된 앱의 파일은 그대로');
    // 앱 삭제: 관련 파일 목록을 보여주고, 함께 옮긴다
    await page.click('.applist .cell:has-text("Old Tool") >> text=삭제…');
    await page.waitForSelector('.modal li', { timeout: 20000 });
    assert.strictEqual(await page.locator('.modal li').count(), 3);
    await page.waitForTimeout(500);
    await shot('8b-app-remove');
    await page.click('.modal .btn.primary');
    await page.waitForSelector('.toast:has-text("Old Tool")', { timeout: 20000 });
    assert.ok(!fs.existsSync(path.join(home, 'Applications/Old Tool.app')), '앱이 옮겨져야 함');
    assert.ok(!fs.existsSync(path.join(home, 'Library/Application Support/Old Tool')), '관련 파일도 옮겨져야 함');
    assert.ok(fs.existsSync(path.join(home, 'Applications/Foo.app')), '다른 앱은 그대로');

    // 최적화 탭: 맥 상태, 무거운 프로그램, 자동 실행 항목
    await page.click('.nav-item:has-text("최적화")');
    await page.waitForSelector('.health .cell', { timeout: 20000 });
    assert.ok(await page.locator('.health .cell').count() >= 2, '상태 점검 항목이 보여야 함');
    // 보안 점검: 알려진 가짜 정리 프로그램 이름의 자동 실행 항목을 잡아낸다
    await page.waitForSelector('.security .cell:has-text("수상한 자동 실행 항목")', { timeout: 20000 });
    assert.ok((await page.locator('.security').innerText()).includes('1개 발견'), '수상한 항목 1개');
    assert.ok((await page.locator('#main').innerText()).includes('백신이 아니에요'), '한계를 알려야 함');
    await page.waitForSelector('.procs .cell');
    assert.ok(await page.locator('.procs .cell').count() >= 1, '무거운 프로그램 목록이 보여야 함');
    await page.waitForSelector('.startup .cell:has-text("Example Updater")');
    await page.waitForTimeout(700);
    await shot('7-optimize');
    await page.evaluate(() => { const m = document.getElementById('main'); m.scrollTop = m.scrollHeight; });
    await page.waitForTimeout(300);
    await shot('7b-optimize-startup');
    // 자동 실행 끄기 → 설정 파일이 휴지통으로 가고 목록에서 사라진다
    await page.click('.startup .cell:has-text("Example Updater") >> text=끄기');
    await page.click('.modal .btn.primary');
    await page.waitForSelector('.toast:has-text("자동 실행을 껐어요")', { timeout: 20000 });
    assert.ok(!fs.existsSync(path.join(home, 'Library/LaunchAgents/com.example.updater.plist')), '설정 파일이 옮겨져야 함');
    assert.strictEqual(await page.locator('.startup .cell:has-text("Example Updater")').count(), 0);
    assert.deepStrictEqual(errors, []);
    console.log('UI 확인 통과');
  } catch (e) {
    try {
      const page = await app.firstWindow();
      console.error('--- 실패 시점의 화면 글자 ---\n' + (await page.locator('#main').innerText()).slice(0, 1200) + '\n…\n' + (await page.locator('#main').innerText()).slice(-1200));
    } catch { /* 화면을 읽지 못함 */ }
    throw e;
  } finally {
    await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
