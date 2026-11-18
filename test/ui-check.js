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
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--no-sandbox'],
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

    // 지름길: 안전한 항목 한 번에 고르기 → 중복 사본 3 + 설치 파일 1 + 캐시 1 + 로그 1
    await page.click('#safeBtn');
    assert.match(await page.locator('#actionbar .info b').innerText(), /^6개/);
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

    // 정리 추천
    await page.click('.nav-item:has-text("정리 추천")');
    await page.click('.cat-head:has-text("앱 임시 파일")');
    await page.locator('.cat:has-text("앱 임시 파일") .cat-tools input').check();
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
    assert.deepStrictEqual(errors, []);
    console.log('UI 확인 통과');
  } finally {
    await app.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
