'use strict';
// 검사 한 번의 전체 흐름: 폴더 훑기 → 중복 찾기 → 정리 추천.
const path = require('path');
const { walk } = require('./walk');
const { findDuplicates } = require('./duplicates');
const { buildRecommendations } = require('./recommend');

const KEEP_MIN = 100 * 1000; // 이보다 작은 파일은 정리 효과가 거의 없어 기억하지 않음
const MAX_GROUPS = 1500;

async function runScan({ home, roots, minDupSize = 1000 * 1000, useBirthtime = true, onProgress = () => {}, isCancelled = () => false }) {
  const started = Date.now();
  const files = [];
  const scanRoots = roots && roots.length ? roots : [home];
  const walkStats = await walk({
    roots: scanRoots,
    skipPaths: [path.join(home, 'Library')],
    minSize: KEEP_MIN,
    onFile: (f) => files.push(f),
    onProgress: (p) => onProgress({ phase: 'walk', ...p }),
    isCancelled,
  });
  if (isCancelled()) return null;

  const allGroups = await findDuplicates(files, {
    minSize: minDupSize,
    onProgress: (p) => onProgress({ phase: 'hash', ...p }),
    isCancelled,
  });
  if (isCancelled()) return null;

  const categories = await buildRecommendations({
    home, files, useBirthtime,
    onProgress: (p) => onProgress({ phase: 'recommend', ...p }),
    isCancelled,
  });
  if (isCancelled()) return null;

  const slim = (f) => ({ path: f.path, size: f.size, mtimeMs: f.mtimeMs });
  const groups = allGroups.slice(0, MAX_GROUPS).map((g) => ({ ...g, files: g.files.map(slim) }));
  return {
    roots: scanRoots,
    groups,
    categories,
    summary: {
      files: walkStats.files,
      bytes: walkStats.bytes,
      denied: walkStats.denied,
      dupGroups: allGroups.length,
      dupFiles: allGroups.reduce((n, g) => n + g.files.length - 1, 0),
      dupWasted: allGroups.reduce((n, g) => n + g.wasted, 0),
      recoTotal: categories.reduce((n, c) => n + c.total, 0),
      elapsedMs: Date.now() - started,
    },
  };
}

module.exports = { runScan };
