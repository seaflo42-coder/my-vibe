'use strict';
// "파일 종류" 탭에서 찾아 주는 확장자 목록. 묶음 순서와 이름이 화면에 그대로 나온다.
const w = (list) => list.split(' ');
const TYPE_GROUPS = [
  { id: 'design', title: '디자인', kind: '디자인 파일', exts: w('ai ait eps psd psb psdt indd indt idml sketch fig xd afdesign afphoto afpub svg svgz cdr xcf procreate clip csp kra ora sai mdp pdn pxd pxm graffle drawio vsdx studio') },
  { id: 'image', title: '이미지', kind: '이미지', exts: w('jpg jpeg jpe jfif png gif heic heif webp avif jxl tif tiff bmp ico icns tga exr hdr pcx raw cr2 cr3 crw nef nrw arw srf sr2 dng raf orf rw2 pef srw x3f erf kdc 3fr iiq') },
  { id: 'video', title: '동영상', kind: '동영상', exts: w('mov mp4 m4v avi mkv wmv webm flv f4v mpg mpeg m2v mts m2ts m2t ts 3gp 3g2 vob mxf ogv divx asf rm rmvb dv mod tod braw r3d insv lrv') },
  { id: 'audio', title: '음악·소리', kind: '소리 파일', exts: w('mp3 m4a m4b m4r wav aif aiff aifc flac alac aac ogg oga wma opus mid midi caf amr ape wv mka ac3 dts dsf au ra') },
  { id: 'doc', title: '문서', kind: '문서', exts: w('pdf doc docx docm dot dotx hwp hwpx hwt ppt pptx pptm pps ppsx xls xlsx xlsm xlsb pages numbers key show cell txt rtf md csv tsv odt ods odp tex xps one wps') },
  { id: 'ebook', title: '전자책·메일', kind: '전자책·메일', exts: w('epub mobi azw azw3 fb2 djvu cbz cbr eml msg mbox ics vcf') },
  { id: 'archive', title: '압축 파일', kind: '압축 파일', exts: w('zip zipx rar 7z tar gz tgz bz2 tbz tbz2 xz txz lz lzma zst z cpio arj ace alz egg lzh lha cab sit sitx jar war 001') },
  { id: 'install', title: '설치·디스크', kind: '설치 파일', exts: w('dmg pkg mpkg iso img exe msi apk ipa xip toast deb rpm appimage vmdk vdi vhd vhdx qcow2 sparseimage') },
  { id: 'temp', title: '받다 만·임시 파일', kind: '임시 파일', exts: w('crdownload part partial tmp temp bak old torrent') },
  { id: 'project', title: '영상·음악 작업', kind: '작업 파일', exts: w('prproj aep aet drp fcpxml logicx band als ptx ptf cpr veg mogrt imovieproj rpp flp sesx') },
  { id: 'subtitle', title: '자막', kind: '자막', exts: w('srt smi ass ssa vtt sub idx') },
  { id: '3d', title: '3D·도면', kind: '3D·도면', exts: w('blend fbx obj stl ply dae abc c4d max ma mb skp dwg dxf 3ds 3mf glb gltf usd usda usdc usdz step stp iges igs sldprt sldasm f3d rvt ifc ztl zpr spp sbsar hip') },
  { id: 'font', title: '글꼴', kind: '글꼴', exts: w('ttf otf ttc woff woff2 eot dfont pfb') },
  { id: 'code', title: '코드·데이터', kind: '코드·데이터', exts: w('json xml yaml yml html htm css scss js mjs jsx tsx py ipynb java kt c cpp h hpp m swift go rs rb php sh sql db sqlite sqlite3 log') },
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
