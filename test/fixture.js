'use strict';
// 테스트용 가짜 홈 폴더를 만든다 (중복 파일, 캐시, 설치 파일 등 포함).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MB = 1000 * 1000;
const DAY = 86400000;

function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
function age(p, days) {
  const t = new Date(Date.now() - days * DAY);
  fs.utimesSync(p, t, t);
}

function makeHome() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'malkkeum-')));
  const a = crypto.randomBytes(2 * MB);
  const b = crypto.randomBytes(2 * MB);
  // 같은 크기지만 끝부분만 다른 파일 (지문 비교가 정확한지 확인용)
  const a2 = Buffer.from(a); a2[a2.length - 1] ^= 0xff;
  // 가운데만 다른 파일: 일부분 지문은 같을 수 있어도 전체 지문에서 걸러져야 함
  const a3 = Buffer.from(a); a3[700 * 1000] ^= 0xff;
  write(path.join(home, 'Documents/report.bin'), a);
  write(path.join(home, 'Desktop/report copy.bin'), a);
  write(path.join(home, 'Documents/sub/report (2).bin'), a);
  write(path.join(home, 'Documents/almost.bin'), a2);
  write(path.join(home, 'Documents/almost-mid.bin'), a3);
  write(path.join(home, 'Pictures/photo.bin'), b);
  write(path.join(home, 'Movies/photo-dup.bin'), b);
  write(path.join(home, 'Documents/small1.txt'), 'same');
  write(path.join(home, 'Documents/small2.txt'), 'same');
  // 건드리면 안 되는 곳들
  write(path.join(home, 'Applications/Foo.app/Contents/x.bin'), a);
  write(path.join(home, 'Pictures/Photos Library.photoslibrary/originals/p.bin'), b);
  write(path.join(home, '.hidden/secret.bin'), a);
  write(path.join(home, 'Documents/proj/node_modules/x.bin'), a);
  fs.symlinkSync(path.join(home, 'Documents/report.bin'), path.join(home, 'Desktop/link.bin'));
  fs.linkSync(path.join(home, 'Pictures/photo.bin'), path.join(home, 'Pictures/photo-hardlink.bin'));
  // 추천 대상
  write(path.join(home, 'Downloads/Installer.dmg'), crypto.randomBytes(3 * MB));
  write(path.join(home, 'Downloads/old-thing.zip'), crypto.randomBytes(2 * MB));
  age(path.join(home, 'Downloads/old-thing.zip'), 400);
  write(path.join(home, 'Downloads/new-thing.zip'), crypto.randomBytes(2 * MB));
  write(path.join(home, 'Library/Caches/com.example.app/data'), crypto.randomBytes(2 * MB));
  write(path.join(home, 'Library/Caches/com.apple.Safari/data'), crypto.randomBytes(2 * MB));
  write(path.join(home, 'Library/Logs/app.log'), crypto.randomBytes(2 * MB));
  write(path.join(home, 'Library/Preferences/keep.plist'), a);
  write(path.join(home, '.Trash/junk.bin'), crypto.randomBytes(1 * MB));
  // 지워도 안전한 항목 확인용: 브라우저 임시 파일, 메일 첨부 사본
  write(path.join(home, 'Library/Application Support/Google/Chrome/Default/Code Cache/js/blob'), crypto.randomBytes(1500 * 1000));
  write(path.join(home, 'Library/Application Support/Google/Chrome/Default/Bookmarks'), 'keep');
  write(path.join(home, 'Library/Containers/com.apple.mail/Data/Library/Mail Downloads/A1B2/계약서.pdf'), crypto.randomBytes(300 * 1000));
  // 보안 점검 확인용: 알려진 가짜 정리 프로그램 이름의 자동 실행 항목
  write(path.join(home, 'Library/LaunchAgents/com.mackeeper.agent.plist'),
    '<?xml version="1.0"?><plist><dict><key>Label</key><string>com.mackeeper.agent</string><key>ProgramArguments</key><array><string>/Users/Shared/.helper/agent</string></array><key>RunAtLoad</key><true/></dict></plist>');
  // 파일 종류 탭 확인용: 디자인·동영상 파일 (작은 것도 찾아야 한다)
  write(path.join(home, 'Documents/design/logo.ai'), crypto.randomBytes(200 * 1000));
  write(path.join(home, 'Documents/design/poster.psd'), crypto.randomBytes(1500 * 1000));
  write(path.join(home, 'Documents/design/icon.eps'), crypto.randomBytes(20 * 1000));
  write(path.join(home, 'Movies/clip.mp4'), crypto.randomBytes(1200 * 1000));
  // 앱 탭 확인용: 오래 안 쓴 앱 하나와 그 관련 파일, 그리고 이미 지운 앱이 남긴 파일
  write(path.join(home, 'Applications/Old Tool.app/Contents/Info.plist'),
    '<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>com.example.oldtool</string><key>CFBundleName</key><string>Old Tool</string></dict></plist>');
  write(path.join(home, 'Applications/Old Tool.app/Contents/MacOS/oldtool'), crypto.randomBytes(3 * MB));
  write(path.join(home, 'Library/Application Support/Old Tool/data.db'), crypto.randomBytes(600 * 1000));
  write(path.join(home, 'Library/Caches/com.example.oldtool/blob'), crypto.randomBytes(300 * 1000));
  write(path.join(home, 'Library/Preferences/com.example.oldtool.plist'), 'prefs');
  write(path.join(home, 'Library/Caches/com.gone.ghostapp/blob'), crypto.randomBytes(400 * 1000));
  write(path.join(home, 'Library/Application Support/com.gone.ghostapp/store'), crypto.randomBytes(500 * 1000));
  write(path.join(home, 'Library/Preferences/com.gone.ghostapp.plist'), 'prefs');
  // 맥을 켤 때 자동으로 실행되는 항목 (최적화 탭 확인용)
  write(path.join(home, 'Library/LaunchAgents/com.example.updater.plist'),
    '<?xml version="1.0"?><plist><dict><key>Label</key><string>com.example.updater</string><key>ProgramArguments</key><array><string>/Applications/Example Updater.app/Contents/MacOS/updater</string></array><key>RunAtLoad</key><true/></dict></plist>');
  write(path.join(home, 'Movies/big.mov'), crypto.randomBytes(101 * MB));
  return home;
}


module.exports = { makeHome, MB };
