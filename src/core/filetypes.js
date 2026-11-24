'use strict';
// "파일 종류" 탭에서 찾아 주는 확장자 목록. 묶음 순서와 이름이 화면에 그대로 나온다.
const TYPE_GROUPS = [
  { id: 'design', title: '디자인', kind: '디자인 파일', exts: ['ai', 'eps', 'psd', 'psb', 'indd', 'idml', 'sketch', 'fig', 'xd', 'afdesign', 'afphoto', 'afpub', 'svg', 'cdr', 'xcf', 'procreate', 'clip'] },
  { id: 'image', title: '이미지', kind: '이미지', exts: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'tif', 'tiff', 'bmp', 'ico', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2'] },
  { id: 'video', title: '동영상', kind: '동영상', exts: ['mov', 'mp4', 'm4v', 'avi', 'mkv', 'wmv', 'webm', 'flv', 'mpg', 'mpeg', 'mts', 'm2ts', '3gp', 'ts', 'vob', 'mxf', 'braw', 'r3d'] },
  { id: 'audio', title: '음악·소리', kind: '소리 파일', exts: ['mp3', 'm4a', 'wav', 'aif', 'aiff', 'flac', 'aac', 'ogg', 'wma', 'opus', 'mid', 'caf'] },
  { id: 'doc', title: '문서', kind: '문서', exts: ['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx', 'xls', 'xlsx', 'pages', 'numbers', 'key', 'txt', 'rtf', 'md', 'csv', 'epub', 'odt'] },
  { id: 'archive', title: '압축 파일', kind: '압축 파일', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'alz', 'egg', 'lzh', 'cab', 'sit', 'zipx'] },
  { id: 'install', title: '설치·디스크', kind: '설치 파일', exts: ['dmg', 'pkg', 'iso', 'img', 'exe', 'msi', 'apk', 'ipa', 'xip', 'toast'] },
  { id: 'project', title: '영상·음악 작업', kind: '작업 파일', exts: ['prproj', 'aep', 'drp', 'fcpxml', 'logicx', 'band', 'als', 'ptx', 'cpr', 'veg', 'mogrt'] },
  { id: '3d', title: '3D·도면', kind: '3D·도면', exts: ['blend', 'fbx', 'obj', 'stl', 'c4d', 'max', 'ma', 'mb', 'skp', 'dwg', 'dxf', '3ds', 'glb', 'gltf', 'usdz'] },
  { id: 'font', title: '글꼴', kind: '글꼴', exts: ['ttf', 'otf', 'ttc', 'woff', 'woff2'] },
];
const EXT_SET = new Set(TYPE_GROUPS.flatMap((g) => g.exts));

/** 경로의 확장자 (소문자, 점 없이). 숨김 파일(.zshrc)이나 확장자가 없으면 ''. */
function extOf(p) {
  const name = p.slice(p.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** 파일 목록을 확장자별로 나눈다. */
function indexByType(files) {
  const byExt = new Map();
  for (const f of files) {
    const e = extOf(f.path);
    if (!EXT_SET.has(e) || f.cloudOnly) continue;
    const arr = byExt.get(e);
    if (arr) arr.push(f); else byExt.set(e, [f]);
  }
  return byExt;
}
/** 확장자별 개수와 용량 요약 (화면에 보낼 작은 표) */
function summarize(byExt) {
  const out = {};
  for (const [e, arr] of byExt) out[e] = { count: arr.length, size: arr.reduce((n, f) => n + f.size, 0) };
  return out;
}

module.exports = { TYPE_GROUPS, EXT_SET, extOf, indexByType, summarize };
