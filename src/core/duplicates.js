'use strict';
// 중복 파일 찾기: 크기 → 일부분 지문 → 전체 지문(SHA-256) 순서로 좁혀간다.
// 마지막에 반드시 파일 전체를 비교하므로 "내용이 완전히 같은 파일"만 중복으로 본다.
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const SAMPLE = 16 * 1024;

async function quickHash(file) {
  const h = crypto.createHash('sha256');
  const fh = await fsp.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(SAMPLE);
    const offsets =
      file.size <= SAMPLE * 3
        ? [0]
        : [0, Math.floor(file.size / 2) - SAMPLE / 2, file.size - SAMPLE];
    for (const off of offsets) {
      const len = file.size <= SAMPLE * 3 ? Math.min(file.size, SAMPLE) : SAMPLE;
      const { bytesRead } = await fh.read(buf, 0, len, off);
      h.update(buf.subarray(0, bytesRead));
    }
  } finally {
    await fh.close();
  }
  return h.digest('hex');
}

function fullHash(file, onBytes, isCancelled) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file.path, { highWaterMark: 1024 * 1024 });
    s.on('data', (c) => {
      h.update(c);
      if (onBytes) onBytes(c.length);
      if (isCancelled && isCancelled()) s.destroy(new Error('cancelled'));
    });
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const it of list) {
    const k = keyFn(it);
    const g = m.get(k);
    if (g) g.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * @param {Array} files walk()가 모은 파일 목록
 * @returns {Promise<Array<{hash,size,wasted,files:Array}>>} 낭비 용량 큰 순
 */
async function findDuplicates(files, { minSize = 1, onProgress, isCancelled } = {}) {
  // 같은 실체를 가리키는 하드링크는 한 번만 센다 (지워도 공간이 늘지 않음)
  const seenInode = new Set();
  const candidates = [];
  for (const f of files) {
    if (f.size < minSize || f.size === 0 || f.cloudOnly) continue;
    const key = `${f.dev}:${f.ino}`;
    if (f.ino && seenInode.has(key)) continue;
    seenInode.add(key);
    candidates.push(f);
  }

  const bySize = [...groupBy(candidates, (f) => f.size).values()].filter((g) => g.length > 1);

  // 1차: 일부분 지문
  const stage2 = [];
  let done = 0;
  const totalQuick = bySize.reduce((n, g) => n + g.length, 0);
  for (const g of bySize) {
    if (isCancelled && isCancelled()) return [];
    const hashed = [];
    for (const f of g) {
      try {
        hashed.push({ f, q: await quickHash(f) });
      } catch { /* 읽을 수 없는 파일은 제외 */ }
      done++;
      if (onProgress && done % 50 === 0) onProgress({ step: 'quick', done, total: totalQuick });
    }
    for (const sub of groupBy(hashed, (x) => x.q).values()) {
      if (sub.length > 1) stage2.push(sub.map((x) => x.f));
    }
  }

  // 2차: 전체 지문
  const totalBytes = stage2.reduce((n, g) => n + g.length * g[0].size, 0);
  let doneBytes = 0;
  let lastTick = 0;
  const onBytes = (n) => {
    doneBytes += n;
    const now = Date.now();
    if (onProgress && now - lastTick > 120) {
      lastTick = now;
      onProgress({ step: 'full', done: doneBytes, total: totalBytes });
    }
  };
  const groups = [];
  for (const g of stage2) {
    if (isCancelled && isCancelled()) return [];
    const hashed = [];
    for (const f of g) {
      try {
        hashed.push({ f, h: await fullHash(f, onBytes, isCancelled) });
      } catch (e) {
        if (e.message === 'cancelled') return [];
      }
    }
    for (const [hash, sub] of groupBy(hashed, (x) => x.h)) {
      if (sub.length < 2) continue;
      const fl = sub.map((x) => x.f).sort((a, b) => a.mtimeMs - b.mtimeMs);
      groups.push({ hash, size: fl[0].size, wasted: fl[0].size * (fl.length - 1), files: fl });
    }
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return groups;
}

// 묶음 안에서 "원본일 가능성이 가장 높은 파일"을 고른다. 나머지를 지우도록 추천하기 위함.
//  - 이름에 사본 표시(복사본, copy, (2) …)가 있으면 사본일 가능성이 높다
//  - 다운로드 폴더에 있는 쪽은 다시 받을 수 있으니 사본으로 본다
//  - 그래도 같으면 가장 오래된 파일, 그다음 경로가 짧은 파일을 원본으로 본다
const COPY_MARK = /(복사본|사본|\bcopy\b|\(\d+\)$|[ _-]\d{1,2}$| 2$)/i;
function copyScore(p) {
  const base = p.slice(p.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  let score = 0;
  if (COPY_MARK.test(base)) score += 2;
  if (/\/Downloads\//.test(p)) score += 1;
  return score;
}
function pickOriginal(files) {
  return [...files].sort((a, b) =>
    copyScore(a.path) - copyScore(b.path) || a.mtimeMs - b.mtimeMs || a.path.length - b.path.length)[0];
}

module.exports = { findDuplicates, quickHash, fullHash, pickOriginal };
