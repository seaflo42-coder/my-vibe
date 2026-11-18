'use strict';
// 폴더를 안전하게 훑어보는 모듈. 심볼릭 링크는 따라가지 않고,
// 앱/사진 보관함 같은 "꾸러미" 폴더와 숨김 폴더 안쪽은 건드리지 않는다.
const fsp = require('fs/promises');
const path = require('path');

// 폴더처럼 보이지만 실제로는 하나의 파일처럼 다뤄야 하는 꾸러미들
const PACKAGE_EXTS = new Set([
  '.app', '.photoslibrary', '.photolibrary', '.aplibrary', '.musiclibrary', '.tvlibrary',
  '.imovielibrary', '.fcpbundle', '.logicx', '.band', '.bundle', '.framework', '.plugin',
  '.kext', '.xcodeproj', '.xcworkspace', '.xcarchive', '.sparsebundle', '.rtfd', '.pages',
  '.numbers', '.key', '.pkg', '.mpkg', '.download', '.theater', '.scriv', '.lproj',
  '.dsym', '.playground', '.vmwarevm', '.pvm', '.utm', '.backupdb',
]);
const SKIP_DIR_NAMES = new Set(['node_modules', '__pycache__', '$RECYCLE.BIN']);

function isPackageDir(name) {
  return PACKAGE_EXTS.has(path.extname(name).toLowerCase());
}

/**
 * @param {object} o
 * @param {string[]} o.roots     살펴볼 폴더들
 * @param {string[]} [o.skipPaths] 통째로 건너뛸 절대 경로
 * @param {number} [o.minSize]   이 크기 미만 파일은 보고하지 않음
 * @param {(f:object)=>void} o.onFile
 * @param {(p:object)=>void} [o.onProgress]
 * @param {()=>boolean} [o.isCancelled]
 */
async function walk({ roots, skipPaths = [], minSize = 0, onFile, onProgress, isCancelled }) {
  const skip = new Set(skipPaths.map((p) => path.resolve(p)));
  const seenDirs = new Set();
  const stack = [];
  for (const r of roots) stack.push(path.resolve(r));
  const stats = { files: 0, dirs: 0, bytes: 0, denied: [], errors: 0 };
  let lastTick = 0;

  while (stack.length) {
    if (isCancelled && isCancelled()) break;
    const dir = stack.pop();
    if (seenDirs.has(dir) || skip.has(dir)) continue;
    seenDirs.add(dir);
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM') stats.denied.push(dir);
      else stats.errors++;
      continue;
    }
    stats.dirs++;
    const fileNames = [];
    for (const ent of entries) {
      const name = ent.name;
      if (name.startsWith('.')) continue; // 숨김 항목은 건드리지 않음
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(name) || isPackageDir(name)) continue;
        stack.push(path.join(dir, name));
      } else if (ent.isFile()) {
        fileNames.push(name);
      }
    }
    for (let i = 0; i < fileNames.length; i += 64) {
      const chunk = fileNames.slice(i, i + 64);
      const sts = await Promise.all(
        chunk.map((n) => fsp.lstat(path.join(dir, n)).catch(() => null)),
      );
      for (let j = 0; j < chunk.length; j++) {
        const st = sts[j];
        if (!st || !st.isFile()) continue;
        stats.files++;
        stats.bytes += st.size;
        if (st.size < minSize) continue;
        onFile({
          path: path.join(dir, chunk[j]),
          size: st.size,
          mtimeMs: st.mtimeMs,
          atimeMs: st.atimeMs,
          dev: st.dev,
          ino: st.ino,
          // iCloud에만 있고 맥에는 내려받지 않은 파일(공간을 차지하지 않음)
          cloudOnly: st.size > 0 && st.blocks === 0,
        });
      }
    }
    const now = Date.now();
    if (onProgress && now - lastTick > 120) {
      lastTick = now;
      onProgress({ files: stats.files, dirs: stats.dirs, bytes: stats.bytes, current: dir });
    }
  }
  return stats;
}

/** 폴더(또는 파일) 하나가 차지하는 크기를 계산. 접근 불가 항목은 건너뛴다. */
async function dirSize(target, isCancelled) {
  let size = 0;
  let count = 0;
  let denied = false;
  const stack = [target];
  while (stack.length) {
    if (isCancelled && isCancelled()) break;
    const p = stack.pop();
    let st;
    try {
      st = await fsp.lstat(p);
    } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM') denied = true;
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      try {
        const names = await fsp.readdir(p);
        for (const n of names) stack.push(path.join(p, n));
      } catch (e) {
        if (e.code === 'EACCES' || e.code === 'EPERM') denied = true;
      }
    } else if (st.isFile()) {
      size += st.size;
      count++;
    }
  }
  return { size, count, denied };
}

module.exports = { walk, dirSize, isPackageDir, PACKAGE_EXTS };
