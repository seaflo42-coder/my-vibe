'use strict';
/* 말끔 — 화면 동작. 프레임워크 없이 작성했고, 파일 이름은 항상 textContent로만 넣는다.
   흐름: ① 검사 → ② 고르기 → ③ 비우기  (설계 기준은 저장소 맨 위 DESIGN.md) */
(() => {
  const api = window.api;
  const $ = (id) => document.getElementById(id);

  const S = {
    disk: { total: 0, free: 0, home: '' },
    view: 'home',
    roots: [],            // 비어 있으면 홈 폴더 전체
    minDupSize: 1000 * 1000,
    scanning: false,
    progress: null,
    result: null,
    error: null,
    selected: new Map(),  // 경로 → 크기
    done: null,           // 방금 끝낸 정리: { count, freed, freeBefore, emptied, freeAfter }
    dupShown: 40,
    openCats: new Set(),
    catShown: {},
    sort: { key: 'size', dir: -1 }, // 정렬 기준: name · size · kind · date, 방향: 1 오름차순 / -1 내림차순
    busy: false,
    animate: true,
    mode: 'list',         // 보기 방식: list(목록) · columns(계층) · gallery(갤러리)
    query: '',            // 검색어
    searchOpen: false,
    cur: { dups: {}, reco: {} }, // 계층 · 갤러리에서 지금 보고 있는 묶음과 항목
  };
  const SAFE_HINT = '중복 사본, 설치 파일, 앱 임시 파일처럼 없어도 되는 것들이에요.';

  // ---------- 작은 도구들 ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v; // CSP가 인라인 style 속성을 막으므로 CSSOM으로 지정
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'indeterminate') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function icon(name, cls) {
    const s = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    if (cls) s.setAttribute('class', cls);
    for (const [tag, attrs] of window.ICONS[name] || []) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      s.append(el);
    }
    return s;
  }
  function fmt(bytes) {
    if (!bytes || bytes < 0) return '0KB';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let v = bytes / 1000;
    let i = 0;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : i >= 2 ? 2 : 1;
    return v.toFixed(digits).replace(/\.0+$/, '') + u[i];
  }
  // 큰 숫자 표시용: 숫자와 단위를 따로 꾸밀 수 있게 나눈다
  function bigNum(cls, text) {
    const m = text.match(/^([\d.]+)(\D+)$/) || [null, text, ''];
    return h('span', { class: cls }, m[1], h('small', {}, m[2]));
  }
  const nf = new Intl.NumberFormat('ko-KR');
  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  function tilde(dir) {
    const home = S.disk.home;
    return home && (dir === home || dir.startsWith(home + '/')) ? '~' + dir.slice(home.length) : dir;
  }
  function split(p) {
    const i = p.lastIndexOf('/');
    return { dir: tilde(p.slice(0, i) || '/'), name: p.slice(i + 1) };
  }
  const selTotal = () => { let n = 0; for (const v of S.selected.values()) n += v; return n; };

  // ---------- 파일의 실제 모습 (미리보기 그림 · 맥 파일 아이콘) ----------
  const thumbCache = new Map(); // 경로 → data URL (없으면 null)
  const thumbWatch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      thumbWatch.unobserve(e.target);
      loadThumb(e.target);
    }
  }, { rootMargin: '200px' });
  function paintThumb(el, url) {
    if (!url) return;
    el.replaceChildren(h('img', { src: url, alt: '', draggable: 'false' }));
    el.classList.add('has-img');
  }
  async function loadThumb(el) {
    const { path, size } = el.dataset;
    const key = `${size}:${path}`;
    if (!thumbCache.has(key)) {
      let url = null;
      try { url = await api.thumb(path, Number(size)); } catch { /* 기본 아이콘 유지 */ }
      thumbCache.set(key, url);
    }
    if (el.isConnected) paintThumb(el, thumbCache.get(key));
  }
  function thumb(path, isDir, cls, size = 72) {
    const el = h('span', { class: 'thumb ' + (cls || ''), 'data-path': path, 'data-size': String(size) }, icon(isDir ? 'folder' : 'file'));
    const key = `${size}:${path}`;
    if (thumbCache.has(key)) paintThumb(el, thumbCache.get(key));
    else thumbWatch.observe(el);
    return el;
  }

  // ---------- 알림 · 대화상자 ----------
  function toast(msg, action) {
    const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, msg));
    if (action) t.append(h('button', { class: 'btn small', onclick: () => { t.remove(); action.run(); } }, action.label));
    $('toastRoot').replaceChildren(t);
    setTimeout(() => t.remove(), action ? 10000 : 4000);
  }
  function modal({ glyph = 'trash', tone = '', title, body, list, stack, confirm, cancel = '취소', danger }) {
    return new Promise((resolve) => {
      const close = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => close(true) }, confirm);
      const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(false); } },
        h('div', { class: 'modal' + (list ? ' wide' : ''), role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
          h('div', { class: 'orb ' + tone }, icon(glyph)),
          h('h2', {}, title),
          body && h('p', {}, body),
          list && h('ul', { class: stack ? 'stack' : '' }, list.map((r) => h('li', {}, h('span', { class: 'li-t' }, r.title), h('span', { class: 'li-s num' }, r.sub)))),
          h('div', { class: 'btns' }, cancel && h('button', { class: 'btn', onclick: () => close(false) }, cancel), okBtn)));
      document.addEventListener('keydown', onKey);
      $('modalRoot').append(ov);
      okBtn.focus();
    });
  }

  // ---------- ① 검사 ----------
  async function startScan() {
    if (S.scanning || S.busy) return;
    S.scanning = true; S.error = null; S.result = null; S.done = null; S.progress = { phase: 'walk', files: 0 };
    S.selected.clear(); S.dupShown = 40; S.catShown = {}; S.view = 'home'; S.animate = true;
    thumbCache.clear(); S.cur = { dups: {}, reco: {} };
    if (S.query) { S.query = ''; $('searchInput').value = ''; $('searchBox').classList.remove('has-text'); }
    render();
    await api.startScan({ roots: S.roots, minDupSize: S.minDupSize });
  }
  async function cancelScan() {
    await api.cancelScan();
    S.scanning = false; S.progress = null;
    render();
  }
  api.onScanProgress((p) => { if (S.scanning) { S.progress = p; renderProgress(); } });
  api.onScanDone((r) => {
    S.scanning = false; S.progress = null; S.animate = true;
    if (r) {
      S.result = r;
      S.openCats = new Set();
    }
    refreshDisk();
    render();
  });
  api.onScanError((msg) => {
    S.scanning = false; S.progress = null; S.error = msg;
    render();
  });
  async function refreshDisk() {
    try { S.disk = await api.diskInfo(); } catch { /* 그대로 둠 */ }
    if (S.done && S.done.emptied && S.done.freeAfter == null) S.done.freeAfter = S.disk.free;
    if (S.view === 'home' && !S.scanning) renderMain();
  }

  // ---------- ② 고르기 ----------
  function toggle(path, size, on) {
    if (on) S.selected.set(path, size); else S.selected.delete(path);
  }
  function selectDuplicates(rule) {
    for (const g of S.result.groups) {
      const keep = rule === 'newest' ? [...g.files].sort((a, b) => b.mtimeMs - a.mtimeMs)[0].path : g.keep;
      for (const f of g.files) toggle(f.path, f.size, f.path !== keep);
    }
  }
  function clearDupSelection() {
    for (const g of S.result.groups) for (const f of g.files) S.selected.delete(f.path);
    render();
  }
  // 지름길: 지워도 안전한 것만 한 번에 고른다 (중복 사본 + '지워도 안전' 묶음)
  function selectAllSafe() {
    selectDuplicates('keep');
    const keeps = new Set(S.result.groups.map((g) => g.keep)); // 묶음마다 남기기로 한 파일은 건드리지 않는다
    for (const c of S.result.categories) {
      if (c.safety === 'safe') for (const i of c.items) if (!keeps.has(i.path)) toggle(i.path, i.size, true);
    }
    render();
    toast(`안전한 항목 ${nf.format(S.selected.size)}개를 골랐어요. 아래에서 휴지통으로 옮기세요.`);
  }
  // 고른 항목이 어디서 왔는지 (확인 창에서 보여줄 내역)
  function selectionBreakdown() {
    const src = new Map();
    for (const g of S.result.groups) for (const f of g.files) src.set(f.path, '중복 파일');
    for (const c of S.result.categories) for (const i of c.items) if (!src.has(i.path)) src.set(i.path, c.title);
    const rows = new Map();
    for (const [p, size] of S.selected) {
      const k = src.get(p) || '기타';
      const r = rows.get(k) || { n: 0, size: 0 };
      r.n++; r.size += size;
      rows.set(k, r);
    }
    return [...rows].sort((a, b) => b[1].size - a[1].size)
      .map(([k, r]) => ({ title: k, sub: `${nf.format(r.n)}개 · ${fmt(r.size)}` }));
  }

  // ---------- ③ 비우기 ----------
  async function trashSelected() {
    if (S.busy || !S.selected.size) return;
    const count = S.selected.size;
    const ok = await modal({
      glyph: 'trash',
      title: `${nf.format(count)}개 항목, ${fmt(selTotal())}를 휴지통으로 옮길까요?`,
      body: '바로 지워지지 않아요. 잘못 골랐다면 휴지통에서 다시 꺼낼 수 있어요.',
      list: selectionBreakdown(),
      confirm: '휴지통으로 이동',
    });
    if (!ok) return;
    S.busy = true; renderBar();
    const freeBefore = S.disk.free;
    let res;
    try {
      res = await api.trash([...S.selected.keys()]);
    } catch {
      res = { trashed: [], failed: [], freed: 0, crashed: true };
    }
    S.busy = false;
    applyTrashed(res.trashed, res.freed);
    if (res.trashed.length) {
      const prev = S.done && !S.done.emptied ? S.done : { count: 0, freed: 0, freeBefore };
      S.done = { count: prev.count + res.trashed.length, freed: prev.freed + res.freed, freeBefore: prev.freeBefore, emptied: false, freeAfter: null };
      S.view = 'home'; S.animate = true;
    }
    render();
    $('main').scrollTop = 0;
    if (res.crashed) {
      await modal({ glyph: 'alert', tone: 'warn', title: '옮기는 중 문제가 생겼어요', body: '아무것도 지워지지 않았어요. 다시 검사한 뒤 시도해 주세요.', confirm: '확인', cancel: null });
    } else if (res.failed.length) {
      await modal({
        glyph: 'shield', title: `${nf.format(res.failed.length)}개 항목은 그대로 뒀어요`,
        body: res.trashed.length ? `나머지 ${nf.format(res.trashed.length)}개는 휴지통으로 옮겼어요.` : '안전을 위해 옮기지 않았어요.',
        list: failedByReason(res.failed), stack: true,
        // 맥이 접근을 막은 경우에는 어디서 풀 수 있는지 바로 안내한다
        confirm: res.needsPermission ? '권한 설정 열기' : '확인', cancel: res.needsPermission ? '닫기' : null,
      }).then((open) => { if (open && res.needsPermission) api.openPrivacySettings(); });
    }
  }
  function failedByReason(failed) {
    const by = new Map();
    for (const f of failed) {
      const names = by.get(f.reason) || [];
      names.push(split(f.path).name);
      by.set(f.reason, names);
    }
    return [...by].sort((a, b) => b[1].length - a[1].length).map(([reason, names]) => ({
      title: reason,
      sub: `${nf.format(names.length)}개 · ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' 외' : ''}`,
    }));
  }
  function recount() {
    const r = S.result;
    r.summary.dupGroups = r.groups.length;
    r.summary.dupFiles = r.groups.reduce((n, g) => n + g.files.length - 1, 0);
    r.summary.dupWasted = r.groups.reduce((n, g) => n + g.wasted, 0);
    r.summary.recoTotal = r.categories.reduce((n, c) => n + c.total, 0);
  }
  function applyTrashed(paths, freed) {
    if (!S.result || !paths.length) return;
    const gone = new Set(paths);
    const inGone = (p) => gone.has(p) || paths.some((d) => p.startsWith(d + '/'));
    for (const p of [...S.selected.keys()]) if (inGone(p)) S.selected.delete(p);
    const r = S.result;
    r.groups = r.groups
      .map((g) => { const files = g.files.filter((f) => !inGone(f.path)); return { ...g, files, wasted: g.size * (files.length - 1) }; })
      .filter((g) => g.files.length > 1);
    for (const g of r.groups) if (!g.files.some((f) => f.path === g.keep)) g.keep = g.files[0].path;
    for (const c of r.categories) {
      c.items = c.items.filter((i) => !inGone(i.path));
      if (c.id !== 'trash') c.total = c.items.reduce((n, i) => n + i.size, 0);
    }
    r.categories = r.categories.filter((c) => c.id === 'trash' || c.items.length);
    let trash = r.categories.find((c) => c.id === 'trash');
    if (!trash) {
      trash = { id: 'trash', title: '휴지통', desc: '이미 버린 파일들이에요. 휴지통을 비워야 실제로 공간이 생겨요.', safety: 'safe', items: [], total: 0, action: 'emptyTrash' };
      r.categories.unshift(trash);
    }
    trash.total += freed; trash.unknownSize = false;
    recount();
  }
  async function emptyTrash() {
    const ok = await modal({
      glyph: 'alert', tone: 'warn',
      title: '휴지통을 비울까요?',
      body: '휴지통 안의 모든 항목이 완전히 지워지고, 되돌릴 수 없어요.',
      confirm: '휴지통 비우기', danger: true,
    });
    if (!ok) return;
    const res = await api.emptyTrash();
    if (!res.ok) {
      if (res.why === 'cancelled') return;
      if (res.why === 'automation') {
        // 맥이 "말끔이 Finder를 제어"하는 것을 막고 있는 경우: 어디서 켜는지 알려준다
        const open = await modal({
          glyph: 'lock', title: 'Finder에 요청할 권한이 없어요',
          body: '시스템 설정 → 개인정보 보호 및 보안 → 자동화에서 Malkkeum 아래의 Finder를 켜면 여기서 바로 비울 수 있어요. 지금은 Finder에서 휴지통을 열어 직접 비워도 돼요.',
          confirm: '자동화 설정 열기', cancel: '휴지통 열기',
        });
        if (open) api.openAutomationSettings(); else api.openTrash();
        return;
      }
      const open = await modal({
        glyph: 'alert', tone: 'warn', title: '휴지통을 비우지 못했어요',
        body: `${res.reason || ''} Finder에서 휴지통을 열어 직접 비울 수 있어요.`.trim(),
        confirm: '휴지통 열기', cancel: '닫기',
      });
      if (open) api.openTrash();
      return;
    }
    if (res.failed) toast(`항목 ${nf.format(res.failed)}개는 사용 중이라 비우지 못했어요.`);
    if (S.result) {
      S.result.categories = S.result.categories.filter((c) => c.id !== 'trash');
      recount();
    }
    if (S.done) { S.done.emptied = true; S.done.freeAfter = null; S.animate = true; } else toast('휴지통을 비웠어요.');
    render();
    setTimeout(refreshDisk, 1200);
  }

  // ---------- 그리기: 탭 막대 · 제목 줄 ----------
  function go(view, openCat) {
    S.view = view; S.animate = true;
    if (openCat) { S.openCats = new Set([openCat]); S.cur.reco = { sec: openCat, item: null }; }
    render();
    $('main').scrollTop = 0;
  }
  function renderSide() {
    const items = [['home', '저장공간', 'disk'], ['dups', '중복 파일', 'copy'], ['reco', '정리 추천', 'spark'], ['opt', '최적화', 'gauge']];
    $('nav').replaceChildren(...items.map(([id, label, ic]) =>
      h('button', { class: 'nav-item', 'aria-current': S.view === id ? 'page' : null, onclick: () => go(id) },
        icon(ic), h('span', { class: 'label' }, label))));
  }
  // 지금 어느 단계인지: 1 검사 → 2 고르기 → 3 비우기 (4 = 모두 끝남)
  function currentStep() {
    if (S.done) return S.done.emptied ? 4 : 3;
    return S.result && !S.scanning ? 2 : 1;
  }
  function stepper() {
    const now = currentStep();
    return h('ol', { class: 'stepper', 'aria-label': '진행 단계' }, ['검사', '고르기', '비우기'].map((l, i) =>
      h('li', { class: i + 1 < now ? 'done' : i + 1 === now ? 'now' : '', 'aria-current': i + 1 === now ? 'step' : null },
        h('i', {}, i + 1 < now ? icon('check') : String(i + 1)), l)));
  }
  function renderToolbar() {
    const r = S.scanning ? null : S.result;
    const kids = [];
    if (S.view === 'home') {
      kids.push(h('h1', {}, '저장공간'), h('span', { class: 'grow' }), stepper());
      if (S.scanning) kids.push(h('button', { class: 'btn', onclick: cancelScan }, icon('stop'), '검사 중단'));
      else if (r) kids.push(h('button', { class: 'btn', id: 'scanBtn', onclick: startScan }, icon('again'), '다시 검사'));
    } else if (S.view === 'opt') {
      kids.push(h('h1', {}, '최적화'), h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => { O.health = null; O.startup = null; renderMain(); loadOptimize(true); } }, icon('again'), '다시 확인'));
    } else {
      const dups = S.view === 'dups';
      kids.push(h('h1', {}, dups ? '중복 파일' : '정리 추천'));
      if (r && query()) {
        const secs = sections(S.view);
        const n = secs.reduce((k, x) => k + (x.action ? 0 : x.items.length), 0);
        kids.push(h('span', { class: 'sub num' }, `검색 결과 ${nf.format(n)}개`));
      } else if (r && dups && r.groups.length) kids.push(h('span', { class: 'sub num' }, `묶음 ${nf.format(r.groups.length)}개 · 최대 ${fmt(r.summary.dupWasted)}`));
      else if (r && !dups && r.categories.length) kids.push(h('span', { class: 'sub num' }, `${r.categories.length}가지 · 최대 ${fmt(r.summary.recoTotal)}`));
    }
    $('toolbar').replaceChildren(...kids);
    renderTools();
  }

  // ---------- 그리기: 저장공간 ----------
  const CAT_LOOK = {
    dups: ['copy', 'var(--accent)'], trash: ['trash', 'var(--gray)'], installers: ['box', 'var(--teal)'],
    caches: ['bolt', 'var(--green)'], logs: ['doc', 'var(--gray)'], dev: ['wrench', 'var(--indigo)'],
    oldDownloads: ['clock', 'var(--orange)'], iosBackups: ['phone', 'var(--purple)'], large: ['large', 'var(--orange)'],
  };
  function tile(id) {
    const [ic, color] = CAT_LOOK[id] || ['doc', 'var(--gray)'];
    return h('span', { class: 'tile', style: `background:${color}` }, icon(ic));
  }
  function parts() {
    const d = S.disk;
    const r = S.scanning ? null : S.result;
    const p = { dup: 0, safe: 0, review: 0 };
    if (r) {
      p.dup = r.summary.dupWasted;
      for (const c of r.categories) p[c.safety] += c.total;
    }
    const usedAll = Math.max(0, d.total - d.free);
    p.gain = Math.min(p.dup + p.safe + p.review, usedAll);
    p.used = Math.max(0, usedAll - p.gain);
    p.free = d.free;
    return p;
  }
  /** 면적 지도 배치(squarified treemap): 값에 비례하는 넓이의 사각형으로 가로 W, 세로 H 영역을 채운다. */
  function squarify(items, W, H) {
    const total = items.reduce((n, i) => n + i.v, 0);
    if (!total) return [];
    const area = items.map((i) => (i.v / total) * W * H);
    const out = [];
    let x = 0; let y = 0; let w = W; let hh = H; let row = [];
    const sum = (r) => r.reduce((n, k) => n + area[k], 0);
    const worst = (r, side) => {
      const sm = sum(r); const mx = Math.max(...r.map((k) => area[k])); const mn = Math.min(...r.map((k) => area[k]));
      return Math.max((side * side * mx) / (sm * sm), (sm * sm) / (side * side * mn));
    };
    const flush = () => {
      const sm = sum(row);
      if (w >= hh) {
        const cw = sm / hh; let cy = y;
        for (const k of row) { const rh = area[k] / cw; out.push({ item: items[k], x, y: cy, w: cw, h: rh }); cy += rh; }
        x += cw; w -= cw;
      } else {
        const rh = sm / w; let cx = x;
        for (const k of row) { const cw = area[k] / rh; out.push({ item: items[k], x: cx, y, w: cw, h: rh }); cx += cw; }
        y += rh; hh -= rh;
      }
      row = [];
    };
    for (let k = 0; k < items.length; k++) {
      const side = Math.min(w, hh);
      if (row.length && worst([...row, k], side) > worst(row, side)) flush();
      row.push(k);
    }
    if (row.length) flush();
    return out;
  }
  function storageMap() {
    const r = S.scanning ? null : S.result;
    if (!r) return null;
    const items = [];
    if (r.groups.length) items.push({ id: 'dups', title: '중복 파일', size: r.summary.dupWasted, tone: 'dup', run: () => go('dups') });
    for (const c of r.categories) {
      if (c.total > 0) items.push({ id: c.id, title: c.title.replace(/ \(.*\)$/, ''), size: c.total, tone: c.id === 'trash' ? 'trash' : c.safety, run: () => go('reco', c.id) });
    }
    if (!items.length) return null;
    items.sort((a, b) => b.size - a.size);
    const total = items.reduce((n, i) => n + i.size, 0);
    // 아주 작은 항목도 눌러 볼 수 있게 최소 넓이를 보장한다 (글자로 적힌 용량은 실제 값 그대로)
    for (const i of items) i.v = Math.max(i.size, total * 0.03);
    const W = 100; const H = 22; // 가로로 긴 영역 (화면에서는 % 로 배치)
    const rects = squarify(items, W, H);
    return h('div', { class: 'tmwrap' },
      h('div', { class: 'tmcap' }, h('b', { class: 'num' }, `정리할 수 있는 ${fmt(parts().gain)}`), '를 확대한 지도예요. 블록이 클수록 용량이 커요.'),
      h('div', { class: 'treemap', role: 'list', 'aria-label': '정리할 수 있는 항목 지도' }, rects.map((q) => {
        const small = q.w < 11 || q.h < 9;
        return h('button', {
          class: `tm ${q.item.tone}${small ? ' sm' : ''}`, role: 'listitem', title: `${q.item.title} · ${fmt(q.item.size)}`,
          style: `left:${q.x}%;top:${(q.y / H) * 100}%;width:${q.w}%;height:${(q.h / H) * 100}%`, onclick: q.item.run,
        }, h('span', { class: 'tm-in' }, h('span', { class: 'tm-t' }, q.item.title), h('span', { class: 'tm-v num' }, fmt(q.item.size))));
      })));
  }
  function storageBox(extra) {
    const d = S.disk;
    const p = parts();
    const freePct = d.total ? d.free / d.total : 1;
    const seg = (k) => p[k] > 0 && h('i', { class: 's-' + k, style: `flex:${p[k]} 1 0` });
    return h('section', { class: 'box', 'aria-label': '저장공간 현황' },
      h('div', { class: 'storage' },
        h('div', { class: 'storage-head' },
          bigNum('free num', fmt(d.free)),
          h('span', { class: 'freelabel' }, '사용 가능'),
          freePct < 0.1 && h('span', { class: 'tag low' }, '공간이 많이 부족해요'),
          freePct >= 0.1 && freePct < 0.2 && h('span', { class: 'tag review' }, '공간이 줄어들고 있어요'),
          h('span', { class: 'cap num' }, `이 Mac · 전체 ${fmt(d.total)}`)),
        // 디스크 전체는 실제 비율 그대로 가늘게 보여주고,
        h('div', { class: 'sbar slim', role: 'img', 'aria-label': `전체 ${fmt(d.total)} 중 ${fmt(d.free)} 사용 가능` },
          seg('used'), seg('dup'), seg('safe'), seg('review'), h('i', { class: 's-free', style: `flex:${Math.max(p.free, 1)} 1 0` })),
        h('div', { class: 'legend num' },
          h('span', { class: 'k-used' }, h('i'), `사용 중 ${fmt(p.used)}`),
          p.dup > 0 && h('span', { class: 'k-dup' }, h('i'), `중복 파일 ${fmt(p.dup)}`),
          p.safe > 0 && h('span', { class: 'k-safe' }, h('i'), `지워도 안전 ${fmt(p.safe)}`),
          p.review > 0 && h('span', { class: 'k-review' }, h('i'), `확인 후 삭제 ${fmt(p.review)}`),
          h('span', {}, h('i'), `사용 가능 ${fmt(p.free)}`)),
        // 정리할 수 있는 부분만 따로 크게 펼쳐 보여준다
        storageMap()),
      extra);
  }
  function navCell(x) {
    return h('button', { class: 'cell tiled', onclick: x.run },
      tile(x.id),
      h('div', { class: 'text' }, h('div', { class: 't' }, x.title), h('div', { class: 'd' }, x.desc)),
      h('span', { class: 'v num' }, x.unknown ? '확인 불가' : fmt(x.total)),
      icon('chev', 'chev'));
  }
  function doneCard() {
    const dn = S.done;
    if (dn.emptied) {
      const gained = dn.freeAfter != null ? dn.freeAfter - dn.freeBefore : 0;
      return h('section', { class: 'result box', 'aria-live': 'polite' },
        h('div', { class: 'orb ok' }, icon('check')),
        h('div', { class: 'text' },
          h('h2', {}, '정리를 마쳤어요'),
          h('p', { class: 'num' }, dn.freeAfter == null ? '남은 공간을 다시 확인하고 있어요.'
            : gained > 0 ? `사용 가능한 공간이 ${fmt(dn.freeBefore)}에서 ${fmt(dn.freeAfter)}로 늘었어요.`
              : `항목 ${nf.format(dn.count)}개를 지웠어요. 맥이 공간을 반영하는 데 잠시 걸릴 수 있어요.`)),
        h('button', { class: 'btn', onclick: () => { S.done = null; render(); } }, '확인'));
    }
    return h('section', { class: 'result box', 'aria-live': 'polite' },
      h('div', { class: 'orb' }, icon('trash')),
      h('div', { class: 'text' },
        h('h2', { class: 'num' }, `${nf.format(dn.count)}개 항목, ${fmt(dn.freed)}를 휴지통으로 옮겼어요`),
        h('p', {}, '마지막 단계예요. 휴지통을 비워야 공간이 실제로 늘어나요.')),
      h('button', { class: 'btn plain', onclick: () => api.openTrash() }, icon('undo'), '휴지통에서 되돌리기'),
      h('button', { class: 'btn primary', onclick: emptyTrash }, '휴지통 비우기…'));
  }
  function viewHome() {
    const r = S.scanning ? null : S.result;
    const out = [];
    if (S.done && !S.scanning) out.push(doneCard());

    out.push(storageBox(S.scanning ? h('div', { class: 'progress', id: 'progress' }) : null));

    if (S.error) out.push(h('div', { class: 'banner' }, icon('alert'), h('span', { class: 'grow' }, `검사 중 문제가 생겼어요: ${S.error}`), h('button', { class: 'btn small', onclick: startScan }, '다시 시도')));

    if (S.scanning) {
      out.push(h('div', { class: 'caption' }, '정리할 수 있는 것', h('span', { class: 'side' }, '찾는 중이에요')),
        h('div', { class: 'box' }, [0, 1, 2, 3].map(() => h('div', { class: 'skel' }, h('i'), h('i'), h('i')))));
    } else if (r) {
      const p = parts();
      const dupRow = { id: 'dups', title: '중복 파일', total: r.summary.dupWasted, desc: `똑같은 파일 ${nf.format(r.summary.dupFiles)}개 · 원본으로 보이는 것만 남겨요`, run: () => go('dups') };
      const catRow = (c) => ({ id: c.id, title: c.title, total: c.total, unknown: c.unknownSize, desc: c.desc, run: () => go('reco', c.id) });
      const safe = (r.groups.length ? [dupRow] : []).concat(r.categories.filter((c) => c.safety === 'safe' && c.id !== 'trash').map(catRow));
      const review = r.categories.filter((c) => c.safety === 'review').map(catRow);
      const trash = r.categories.find((c) => c.id === 'trash');

      if (safe.length) {
        out.push(h('section', { class: 'box summary' },
          h('div', { class: 'tier' },
            h('div', { class: 'text' },
              h('div', { class: 'eyebrow safe' }, icon('shield'), '바로 정리해도 안전해요'),
              bigNum('amount num', fmt(safe.reduce((n, x) => n + x.total, 0))),
              h('p', {}, SAFE_HINT)),
            h('button', { class: 'btn primary big', id: 'safeBtn', onclick: selectAllSafe }, icon('wand'), '안전한 항목 모두 고르기')),
          safe.map(navCell)));
      } else {
        out.push(h('section', { class: 'box summary' }, h('div', { class: 'tier' }, h('div', { class: 'text' },
          h('div', { class: 'eyebrow safe' }, icon('shield'), '바로 정리할 것이 없어요'),
          h('p', {}, '중복 파일이나 불필요한 임시 파일을 찾지 못했어요.')))));
      }
      if (review.length) {
        out.push(h('div', { class: 'caption' }, '직접 확인하고 지우세요', h('span', { class: 'side num' }, `최대 ${fmt(p.review)}`)),
          h('div', { class: 'box' }, review.map(navCell)));
      }
      if (trash && !S.done) {
        out.push(h('div', { class: 'box' }, h('div', { class: 'cell tiled' },
          tile('trash'),
          h('div', { class: 'text' }, h('div', { class: 't' }, '휴지통'), h('div', { class: 'd' }, '이미 버린 파일들이에요. 비워야 실제로 공간이 생겨요.')),
          h('span', { class: 'v num' }, trash.unknownSize ? '' : fmt(trash.total)),
          h('button', { class: 'btn small', onclick: emptyTrash }, '비우기…'))));
      }
      if (p.gain > 0) {
        out.push(h('div', { class: 'totalrow' },
          h('span', { class: 'tl' }, '합계'),
          h('span', { class: 'tn' }, '서로 겹치는 항목이 있을 수 있어 최대치로 보여드려요'),
          h('span', { class: 'tv num' }, '최대 ', h('b', {}, fmt(p.gain)))));
      }
      if (r.summary.denied.length) {
        out.push(h('div', { class: 'banner' }, icon('lock'),
          h('span', { class: 'grow' }, `폴더 ${nf.format(r.summary.denied.length)}곳은 권한이 없어 건너뛰었어요. 더 꼼꼼히 찾으려면 '전체 디스크 접근 권한'에서 말끔을 켜 주세요.`),
          h('button', { class: 'btn small', onclick: () => api.openPrivacySettings() }, '설정 열기…')));
      }
      out.push(h('p', { class: 'foot num' }, `파일 ${nf.format(r.summary.files)}개를 ${Math.max(1, Math.round(r.summary.elapsedMs / 1000))}초 동안 살펴봤어요. 시스템 파일, 앱, 사진 보관함, 숨김 폴더는 검사하지도 지우지도 않아요.`));
    } else {
      out.push(h('section', { class: 'box' },
        h('div', { class: 'tier' },
          h('div', { class: 'text' },
            h('h2', {}, '무엇을 정리할 수 있는지 찾아볼게요'),
            h('p', {}, '검사만으로는 아무것도 지워지지 않아요. 결과를 보고 직접 고르면 돼요.')),
          h('button', { class: 'btn primary big', id: 'scanBtn', onclick: startScan }, icon('search'), '검사 시작'))),
      h('div', { class: 'caption' }, '이렇게 진행돼요'),
      h('div', { class: 'box' },
        [['search', '검사', '중복 파일과 지워도 되는 파일을 찾아요. 이 단계에서는 아무것도 지워지지 않아요.'],
          ['wand', '고르기', '안전한 항목은 한 번에 고르고, 나머지는 미리보기로 확인하며 직접 골라요.'],
          ['trash', '비우기', '고른 항목은 먼저 휴지통으로 가요. 휴지통을 비우면 공간이 늘어나요.']].map(([ic, t, d], i) =>
          h('div', { class: 'cell tiled' }, h('span', { class: 'tile ghost' }, icon(ic)),
            h('div', { class: 'text' }, h('div', { class: 't' }, `${i + 1}. ${t}`), h('div', { class: 'd wrap' }, d))))),
      h('div', { class: 'caption' }, '검사 설정'),
      h('div', { class: 'box' },
        h('div', { class: 'cell' },
          h('div', { class: 'text' }, h('div', { class: 't' }, '검사할 곳'),
            h('div', { class: 'd' }, S.roots.length ? S.roots.map(tilde).join(', ') : '홈 폴더 안의 문서, 다운로드, 바탕화면 등을 모두 살펴봐요')),
          h('div', { class: 'seg' },
            h('button', { 'aria-pressed': String(!S.roots.length), onclick: () => { S.roots = []; renderMain(); } }, '홈 폴더 전체'),
            h('button', { 'aria-pressed': String(!!S.roots.length), onclick: pickFolders }, '폴더 선택…'))),
        h('div', { class: 'cell' },
          h('div', { class: 'text' }, h('div', { class: 't' }, '중복으로 볼 최소 크기'), h('div', { class: 'd' }, '이보다 작은 파일은 중복이어도 무시해요')),
          h('div', { class: 'seg num' }, [[100e3, '100KB'], [1e6, '1MB'], [10e6, '10MB']].map(([v, l]) =>
            h('button', { 'aria-pressed': String(S.minDupSize === v), onclick: () => { S.minDupSize = v; renderMain(); } }, l))))),
      h('p', { class: 'foot' }, '시스템 파일, 앱, 사진 보관함, 숨김 폴더는 검사하지도 지우지도 않아요.'));
    }
    return out;
  }
  async function pickFolders() {
    const picked = await api.pickFolders();
    if (picked && picked.length) S.roots = picked;
    renderMain();
  }
  function renderProgress() {
    const el = $('progress');
    if (!el || !S.progress) return;
    const p = S.progress;
    const idx = ['walk', 'hash', 'recommend'].indexOf(p.phase);
    let title; let sub = ''; let pct = null;
    if (p.phase === 'walk') {
      title = `파일 ${nf.format(p.files || 0)}개를 살펴봤어요`;
      sub = tilde(p.current || '');
    } else if (p.phase === 'hash') {
      title = '똑같은 파일인지 비교하고 있어요';
      if (p.total) pct = p.step === 'quick' ? (p.done / p.total) * 0.15 : 0.15 + (p.done / p.total) * 0.85;
      sub = p.step === 'full' ? `${fmt(p.done)} / ${fmt(p.total)}` : '';
    } else {
      title = '정리할 만한 항목을 찾고 있어요';
      sub = p.label || '';
    }
    el.replaceChildren(
      h('div', { class: 't num' }, title, h('span', { class: 'phase' }, `${idx + 1} / 3`)),
      h('div', { class: 'sub num' }, '‎' + sub),
      h('div', { class: 'bar' + (pct == null ? ' indet' : ''), role: 'progressbar' }, h('i', { style: pct == null ? '' : `transform:scaleX(${Math.min(1, pct)})` })));
  }

  // ---------- 그리기: 빈 화면 · 파일 줄 ----------
  function emptyState(ic, title, body, withScan) {
    return h('div', { class: 'empty' }, h('div', { class: 'orb' }, icon(ic)), h('h2', {}, title), h('p', {}, body),
      withScan && h('button', { class: 'btn primary', onclick: startScan }, icon('search'), '검사 시작'));
  }
  function iconBtn(ic, label, run) {
    return h('button', { class: 'ibtn', title: label, 'aria-label': label, onclick: (e) => { e.preventDefault(); e.stopPropagation(); run(); } }, icon(ic));
  }
  async function preview(path) {
    const ok = await api.preview(path);
    if (!ok) api.reveal(path);
  }

  // ---------- 파일 종류 · 정렬 ----------
  const KIND_BY_EXT = new Map();
  for (const [kind, exts] of [
    ['이미지', 'jpg jpeg png heic heif gif webp tiff tif bmp raw svg psd ai'], ['동영상', 'mov mp4 m4v avi mkv wmv webm'],
    ['음악', 'mp3 m4a wav aiff flac aac'], ['PDF 문서', 'pdf'], ['프레젠테이션', 'ppt pptx key'],
    ['문서', 'doc docx hwp hwpx pages txt rtf md'], ['스프레드시트', 'xls xlsx numbers csv'],
    ['압축 파일', 'zip rar 7z tar gz tgz'], ['디스크 이미지', 'dmg iso'], ['설치 패키지', 'pkg mpkg xip'],
  ]) for (const e of exts.split(' ')) KIND_BY_EXT.set(e, kind);
  function kindOf(path, isDir) {
    if (isDir) return '폴더';
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    return KIND_BY_EXT.get(ext) || (ext && ext.length <= 6 ? `${ext.toUpperCase()} 파일` : '파일');
  }
  const SORT_COLS = [['name', '이름'], ['kind', '종류'], ['date', '날짜'], ['size', '크기']];
  const ko = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  /** 정렬 기준에 맞는 비교 함수. get(x)는 { name, kind, date, size }를 돌려준다. */
  function sorter(get) {
    const { key, dir } = S.sort;
    return (x, y) => {
      const a = get(x); const b = get(y);
      const c = key === 'name' ? ko.compare(a.name, b.name)
        : key === 'kind' ? ko.compare(a.kind, b.kind) || ko.compare(a.name, b.name)
          : key === 'date' ? a.date - b.date : a.size - b.size;
      return c * dir;
    };
  }
  function setSort(key) {
    S.sort = S.sort.key === key ? { key, dir: -S.sort.dir } : { key, dir: key === 'name' || key === 'kind' ? 1 : -1 };
    try { localStorage.setItem('sort', JSON.stringify(S.sort)); } catch { /* 저장 못 해도 괜찮음 */ }
    renderMain();
  }
  function sortBtn(key, label, cls) {
    const on = S.sort.key === key;
    return h('button', { class: `sh ${cls}${on ? ' on' : ''}`, 'aria-pressed': String(on), title: `${label} 순으로 정렬`, onclick: () => setSort(key) },
      label, on && icon('chev', S.sort.dir > 0 ? 'arrow up' : 'arrow down'));
  }
  /** 목록 위의 기준 줄: 이름 · 종류 · 날짜 · 크기. 누르면 그 순서로 정렬되고, 다시 누르면 반대로. */
  function sortHead(withThumb, nameLabel = '이름') {
    return h('div', { class: 'row head' },
      h('span', { class: 'sp check' }), withThumb && h('span', { class: 'sp thumbsp' }),
      sortBtn('name', nameLabel, 'file'), h('span', { class: 'acts' }),
      sortBtn('kind', '종류', 'kind'), sortBtn('date', '날짜', 'date'), sortBtn('size', '크기', 'size'));
  }
  /** 계층 · 갤러리처럼 칸이 좁은 보기에서 쓰는 정렬 단추 */
  function sortChips() {
    return h('div', { class: 'sortchips' }, h('span', { class: 'lbl' }, '정렬'), SORT_COLS.map(([k, l]) => sortBtn(k, l, 'chip')));
  }

  // ---------- 살펴보기 공통: 묶음(중복 묶음 · 추천 종류)과 그 안의 항목 ----------
  // 세 가지 보기(목록 · 계층 · 갤러리)가 모두 같은 자료와 같은 선택 규칙을 쓴다.
  const query = () => S.query.trim().toLowerCase();
  const matches = (p) => { const s = query(); return !s || tilde(p).toLowerCase().includes(s); };
  function sections(kind) {
    const r = S.result;
    const byItem = sorter((i) => ({ name: i.label, kind: i.kind, date: i.mtimeMs || 0, size: i.size }));
    if (kind === 'dups') {
      return r.groups
        .filter((g) => g.files.some((f) => matches(f.path))) // 묶음은 통째로 봐야 고를 수 있으므로 하나라도 맞으면 전부 보여준다
        .map((g) => {
          const keepName = split(g.keep).name;
          const fileKind = kindOf(g.keep, false);
          return {
            id: g.hash, kind, group: g, title: keepName, thumbPath: g.keep, total: g.wasted, fileKind,
            date: Math.max(...g.files.map((f) => f.mtimeMs || 0)),
            sub: `똑같은 파일 ${g.files.length}개 · 각 ${fmt(g.size)}`,
            // 중복에서는 "어디에 있느냐"가 판단 기준이므로 위치를 제목으로 쓴다
            items: g.files.map((f) => { const s = split(f.path); const cut = s.dir.lastIndexOf('/') + 1; return { ...f, label: s.dir, pre: s.dir.slice(0, cut), leaf: s.dir.slice(cut), sub: s.name === keepName ? '같은 이름' : s.name, name: s.name, dir: s.dir, kind: fileKind, keep: f.path === g.keep }; })
              .sort(S.sort.key === 'date' ? byItem : (x, y) => ko.compare(x.label, y.label)),
          };
        })
        .sort(sorter((x) => ({ name: x.title, kind: x.fileKind, date: x.date, size: x.total })));
    }
    return r.categories
      .map((c) => ({
        id: c.id, kind, cat: c, title: c.title, tileId: c.id, safety: c.safety, desc: c.desc, total: c.total, unknown: c.unknownSize, action: c.action,
        items: c.items.filter((i) => matches(i.path))
          .map((i) => { const s = split(i.path); return { ...i, label: i.name || s.name, sub: s.dir, name: i.name || s.name, dir: s.dir, kind: kindOf(i.path, i.isDir) }; })
          .sort(byItem),
      }))
      .filter((s) => (query() ? s.items.length > 0 : true));
  }
  // 폴더를 고르면 그 안의 파일도 함께 사라지므로, "고른 것"에는 고른 폴더 안의 파일도 포함해서 따진다
  function goneFn() {
    const chosen = [...S.selected.keys()];
    return (p) => S.selected.has(p) || chosen.some((k) => p.startsWith(k + '/'));
  }
  /** 항목 하나를 고르거나 해제한다. 어느 보기에서든 이 함수 하나만 거친다. 거절되면 false. */
  function toggleItem(sec, it, on) {
    if (sec.group) {
      const gone = goneFn();
      if (!on && !S.selected.has(it.path) && gone(it.path)) {
        toast('이 파일이 들어 있는 폴더가 선택돼 있어요. 정리 추천에서 폴더 선택을 먼저 해제하세요.');
        return false;
      }
      if (on && !sec.group.files.some((x) => x.path !== it.path && !gone(x.path))) {
        toast('똑같은 파일 중 하나는 꼭 남겨야 해요.');
        return false;
      }
    }
    toggle(it.path, it.size, on);
    return true;
  }
  function checkbox(sec, it, on) {
    return h('input', {
      type: 'checkbox', checked: on, 'aria-label': `${it.name} 선택`,
      onclick: (e) => e.stopPropagation(),
      onchange: (e) => { if (!toggleItem(sec, it, e.target.checked)) e.target.checked = !e.target.checked; else render(); },
    });
  }
  const keepBadge = (it, on) => it.keep && !on && h('span', { class: 'keep' }, '원본 추정 · 남김');
  function secHeadTools(sec, gone) {
    if (sec.group) return null;
    const picked = sec.items.filter((i) => gone(i.path));
    const all = sec.items.length > 0 && picked.length === sec.items.length;
    return h('div', { class: 'cat-tools' },
      h('label', {}, h('input', {
        type: 'checkbox', checked: all, indeterminate: picked.length > 0 && !all,
        onchange: (e) => { for (const i of sec.items) toggle(i.path, i.size, e.target.checked); render(); },
      }), `전체 선택 (${nf.format(sec.items.length)}개)`),
      h('span', { class: 'grow' }));
  }
  function trashActions() {
    return h('div', { class: 'cat-actions' },
      h('button', { class: 'btn', onclick: emptyTrash }, icon('trash'), '휴지통 비우기…'),
      h('button', { class: 'btn plain', onclick: () => api.openTrash() }, 'Finder에서 휴지통 열기'));
  }
  function dupActions() {
    return h('div', { class: 'actions-row' },
      h('button', { class: 'btn', onclick: () => { selectDuplicates('keep'); render(); } }, icon('wand'), '추천대로 고르기'),
      h('button', { class: 'btn plain', onclick: () => { selectDuplicates('newest'); render(); } }, '최근 것만 남기기'),
      h('button', { class: 'btn plain', onclick: clearDupSelection }, '선택 해제'));
  }

  // ---------- 보기 1: 목록 ----------
  function viewList(secs, kind) {
    const gone = goneFn();
    const out = [];
    if (kind === 'dups') {
      out.push(h('div', { class: 'leadrow' }, h('p', { class: 'lead' }, '내용이 한 글자도 다르지 않은 파일끼리 묶었어요. 어디에 있는 파일을 지울지 고르세요. 묶음마다 하나는 꼭 남아요.'), dupActions()),
        h('div', { class: 'headbar' }, sortHead(false)));
      for (const sec of secs.slice(0, S.dupShown)) {
        const picked = sec.items.filter((f) => gone(f.path)).length;
        out.push(h('section', { class: 'box group' },
          h('div', { class: 'group-head' },
            thumb(sec.thumbPath, false, 'lg'),
            h('div', { class: 'text' }, h('div', { class: 'title' }, sec.title), h('div', { class: 'sub num' }, sec.sub)),
            h('span', { class: 'save num' + (picked ? ' on' : '') }, picked ? `${fmt(picked * sec.group.size)} 선택됨` : `${fmt(sec.total)} 절약 가능`)),
          sec.items.map((it) => fileRow(sec, it, gone(it.path), false))));
      }
      if (secs.length > S.dupShown) {
        out.push(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => { S.dupShown += 60; renderMain(); } }, `묶음 ${nf.format(secs.length - S.dupShown)}개 더 보기`)));
      }
      return out;
    }
    out.push(h('p', { class: 'lead' }, '지워도 괜찮은 것부터 순서대로 보여드려요. 줄을 두 번 누르면 내용을 미리 볼 수 있어요.'));
    for (const sec of secs) {
      const open = S.openCats.has(sec.id) || !!query();
      const picked = sec.items.filter((i) => gone(i.path));
      const card = h('section', { class: 'box cat' + (open ? ' open' : '') },
        h('button', { class: 'cell tiled cat-head', 'aria-expanded': String(open), onclick: () => { S.openCats.has(sec.id) ? S.openCats.delete(sec.id) : S.openCats.add(sec.id); renderMain(); } },
          tile(sec.tileId),
          h('div', { class: 'text' },
            h('div', { class: 't' }, sec.title, h('span', { class: 'tag ' + sec.safety }, sec.safety === 'safe' ? '지워도 안전' : '확인 후 삭제')),
            h('div', { class: 'd' }, sec.desc)),
          h('span', { class: 'v num' }, sec.unknown ? '확인 불가' : picked.length ? `${fmt(picked.reduce((n, i) => n + i.size, 0))} / ${fmt(sec.total)}` : fmt(sec.total)),
          icon('chev', 'chev')));
      if (open) {
        const body = h('div', { class: 'cat-body' });
        if (sec.action === 'emptyTrash') body.append(trashActions());
        else {
          body.append(secHeadTools(sec, gone), sortHead(true));
          const shown = S.catShown[sec.id] || 30;
          for (const it of sec.items.slice(0, shown)) body.append(fileRow(sec, it, gone(it.path), true));
          if (sec.items.length > shown) {
            body.append(h('div', { class: 'cat-more' }, h('button', { class: 'btn small', onclick: () => { S.catShown[sec.id] = shown + 100; renderMain(); } }, `${nf.format(sec.items.length - shown)}개 더 보기`)));
          }
        }
        card.append(body);
      }
      out.push(card);
    }
    return out;
  }
  /** 이름 칸. 중복 묶음에서는 경로를 한 줄로 쓰고 서로 다른 부분(마지막 폴더)만 진하게 한다. */
  function nameCell(sec, it) {
    if (!sec.group) return h('div', { class: 'file' }, h('div', { class: 'name', title: it.path }, it.label), h('div', { class: 'dir' }, it.sub));
    return h('div', { class: 'file one' },
      h('span', { class: 'name', title: it.path }, h('span', { class: 'pre' }, it.pre), it.leaf),
      h('span', { class: 'chip' }, it.sub));
  }
  function fileRow(sec, it, on, showThumb) {
    return h('label', { class: 'row' + (on ? ' picked' : ''), ondblclick: (e) => { e.preventDefault(); preview(it.path); } },
      checkbox(sec, it, on),
      showThumb && thumb(it.path, it.isDir),
      nameCell(sec, it),
      keepBadge(it, on),
      h('span', { class: 'acts' }, !it.isDir && iconBtn('eye', '미리보기', () => preview(it.path)), iconBtn('finder', 'Finder에서 보기', () => api.reveal(it.path))),
      h('span', { class: 'kind' }, it.kind),
      h('span', { class: 'date num' }, fmtDate(it.mtimeMs)),
      h('span', { class: 'size num' }, fmt(it.size)));
  }

  // ---------- 보기 2 · 3 공통: 지금 보고 있는 묶음과 항목 ----------
  let NAV = null; // 키보드 이동에 쓰는 현재 화면의 자료
  function current(secs, kind) {
    const cur = S.cur[kind];
    const sec = secs.find((s) => s.id === cur.sec) || secs[0];
    const it = sec && (sec.items.find((i) => i.path === cur.item) || sec.items[0]);
    cur.sec = sec ? sec.id : null; cur.item = it ? it.path : null;
    return { sec, it };
  }
  function pick(kind, secId, itemPath) {
    S.cur[kind] = { sec: secId, item: itemPath || null };
    renderMain();
  }
  /** 항목 하나의 자세한 정보: 큰 미리보기, 위치, 크기, 날짜, 고르기 버튼 */
  function detail(sec, it, on, big) {
    if (!it) return h('div', { class: 'detail empty-detail' }, sec && sec.action ? trashActions() : h('p', {}, '항목을 선택하면 자세히 볼 수 있어요.'));
    return h('div', { class: 'detail' + (big ? ' big' : '') },
      h('div', { class: 'stage', ondblclick: () => preview(it.path) }, thumb(it.path, it.isDir, 'xl', 512)),
      h('div', { class: 'meta' },
        h('div', { class: 'dname', title: it.path }, it.name),
        h('dl', {},
          h('dt', {}, '위치'), h('dd', {}, it.dir),
          h('dt', {}, '크기'), h('dd', { class: 'num' }, fmt(it.size)),
          h('dt', {}, '수정한 날짜'), h('dd', { class: 'num' }, fmtDate(it.mtimeMs) || '알 수 없음'),
          h('dt', {}, '종류'), h('dd', {}, it.kind),
          h('dt', {}, '분류'), h('dd', {}, sec.group ? '중복 파일' : sec.title)),
        keepBadge(it, on),
        h('div', { class: 'dbtns' },
          h('button', { class: 'btn' + (on ? '' : ' primary'), onclick: () => { if (toggleItem(sec, it, !on)) render(); } }, icon(on ? 'x' : 'check'), on ? '선택 해제' : '지울 항목으로 고르기'),
          !it.isDir && iconBtn('eye', '미리보기', () => preview(it.path)),
          iconBtn('finder', 'Finder에서 보기', () => api.reveal(it.path)))));
  }

  // ---------- 보기 2: 계층 (묶음 → 항목 → 자세히) ----------
  function viewColumns(secs, kind) {
    const gone = goneFn();
    const { sec, it } = current(secs, kind);
    NAV = { kind, secs, sec, it, items: sec ? sec.items : [] };
    const col1 = h('div', { class: 'col', 'data-scroll': 'c1', role: 'listbox', 'aria-label': kind === 'dups' ? '중복 묶음' : '종류' },
      secs.map((s) => {
        const n = s.items.filter((i) => gone(i.path)).length;
        return h('button', { class: 'crow', role: 'option', 'aria-selected': String(s === sec), onclick: () => pick(kind, s.id) },
          s.group ? thumb(s.thumbPath, false) : tile(s.tileId),
          h('div', { class: 'text' }, h('div', { class: 'name' }, s.title), h('div', { class: 'dir num' }, n ? `${nf.format(n)}개 선택됨` : s.unknown ? '확인 불가' : fmt(s.total))),
          icon('chev', 'chev'));
      }));
    const col2 = h('div', { class: 'col', 'data-scroll': 'c2', role: 'listbox', 'aria-label': '항목' });
    if (sec) {
      if (sec.action === 'emptyTrash') col2.append(trashActions());
      else {
        const tools = secHeadTools(sec, gone);
        if (tools) col2.append(tools);
        const shown = S.catShown['col:' + sec.id] || 200;
        for (const i of sec.items.slice(0, shown)) {
          const on = gone(i.path);
          col2.append(h('div', { class: 'crow' + (on ? ' picked' : ''), role: 'option', 'aria-selected': String(i === it), onclick: () => pick(kind, sec.id, i.path), ondblclick: () => preview(i.path) },
            checkbox(sec, i, on),
            !sec.group && thumb(i.path, i.isDir),
            sec.group ? h('div', { class: 'text' }, h('div', { class: 'name', title: i.path }, h('span', { class: 'pre' }, i.pre), i.leaf), h('div', { class: 'dir' }, i.sub))
              : h('div', { class: 'text' }, h('div', { class: 'name', title: i.path }, i.label), h('div', { class: 'dir' }, i.sub)),
            h('span', { class: 'size num' }, fmt(i.size))));
        }
        if (sec.items.length > shown) col2.append(h('div', { class: 'cat-more' }, h('button', { class: 'btn small', onclick: () => { S.catShown['col:' + sec.id] = shown + 300; renderMain(); } }, `${nf.format(sec.items.length - shown)}개 더 보기`)));
      }
    }
    return [h('div', { class: 'toolsrow' }, sortChips(), h('span', { class: 'grow' }), kind === 'dups' && dupActions()),
      h('div', { class: 'browser columns' }, col1, col2, h('div', { class: 'col wide', 'data-scroll': 'c3' }, detail(sec, it, it ? gone(it.path) : false, false)))];
  }

  // ---------- 보기 3: 갤러리 (큰 미리보기 + 아래 미리보기 줄) ----------
  function viewGallery(secs, kind) {
    const gone = goneFn();
    const flat = [];
    for (const s of secs) if (!s.action) for (const i of s.items) flat.push({ s, i });
    const cur = S.cur[kind];
    let at = flat.findIndex((x) => x.i.path === cur.item && x.s.id === cur.sec);
    if (at < 0) at = flat.findIndex((x) => x.i.path === cur.item);
    if (at < 0) at = 0;
    const here = flat[at];
    if (here) { cur.sec = here.s.id; cur.item = here.i.path; }
    NAV = { kind, flat, at };
    const lo = Math.max(0, at - 150);
    const strip = h('div', { class: 'strip', 'data-scroll': 'strip', role: 'listbox', 'aria-label': '미리보기 줄' });
    let lastSec = null;
    for (const x of flat.slice(lo, lo + 300)) {
      if (x.s !== lastSec) { strip.append(h('span', { class: 'strip-label' }, x.s.title)); lastSec = x.s; }
      const on = gone(x.i.path);
      strip.append(h('button', {
        class: 'cellthumb' + (on ? ' picked' : ''), role: 'option', 'aria-selected': String(x === here), title: x.i.name,
        onclick: () => pick(kind, x.s.id, x.i.path), ondblclick: () => preview(x.i.path),
      }, thumb(x.i.path, x.i.isDir, 'md', 144), on && h('span', { class: 'tick' }, icon('check'))));
    }
    return [h('div', { class: 'toolsrow' }, sortChips(), h('span', { class: 'grow' }), kind === 'dups' && dupActions()),
      h('div', { class: 'browser gallery' },
        here ? detail(here.s, here.i, gone(here.i.path), true) : detail(null, null, false, true),
        h('div', { class: 'strip-wrap' }, h('span', { class: 'count num' }, flat.length ? `${nf.format(at + 1)} / ${nf.format(flat.length)}` : ''), strip))];
  }

  // ---------- 중복 파일 · 정리 추천 화면 ----------
  function viewBrowse(kind) {
    if (S.scanning) return [emptyState('search', '검사하는 중이에요', '끝나면 여기에 결과가 나타나요.')];
    if (!S.result) {
      return [kind === 'dups'
        ? emptyState('copy', '아직 검사하지 않았어요', '검사를 하면 내용이 완전히 같은 파일을 찾아드려요.', true)
        : emptyState('spark', '아직 검사하지 않았어요', '검사를 하면 지워도 되는 파일을 추천해 드려요.', true)];
    }
    const total = kind === 'dups' ? S.result.groups.length : S.result.categories.length;
    if (!total) return [emptyState('done', kind === 'dups' ? '중복된 파일이 없어요' : '추천할 항목이 없어요', kind === 'dups' ? '똑같은 파일을 찾지 못했어요.' : '정리할 만한 파일을 찾지 못했어요.')];
    const secs = sections(kind);
    if (!secs.length) {
      return [h('div', { class: 'empty' }, h('div', { class: 'orb' }, icon('search')), h('h2', {}, '찾는 항목이 없어요'),
        h('p', {}, `"${S.query.trim()}"에 맞는 이름이나 폴더가 없어요.`),
        h('button', { class: 'btn', onclick: () => setQuery('') }, '검색 지우기'))];
    }
    return S.mode === 'columns' ? viewColumns(secs, kind) : S.mode === 'gallery' ? viewGallery(secs, kind) : viewList(secs, kind);
  }
  const browsing = () => (S.view === 'dups' || S.view === 'reco') && !!S.result && !S.scanning;

  // ---------- 검색 · 보기 방식 ----------
  function setQuery(v) {
    S.query = v;
    if ($('searchInput').value !== v) $('searchInput').value = v;
    $('searchBox').classList.toggle('has-text', !!v);
    renderMain();
  }
  function openSearch(open) {
    S.searchOpen = open;
    $('searchBox').classList.toggle('open', open);
    if (open) $('searchInput').focus();
    else { $('searchInput').blur(); if (S.query) setQuery(''); }
  }
  function setMode(m) {
    S.mode = m; S.animate = true;
    try { localStorage.setItem('mode', m); } catch { /* 저장 못 해도 괜찮음 */ }
    renderMain();
  }
  function setupTools() {
    $('searchBtn').append(icon('search'));
    $('searchClear').append(icon('x'));
    $('searchBtn').addEventListener('click', () => openSearch(!S.searchOpen || !S.query ? !S.searchOpen : true));
    $('searchClear').addEventListener('click', () => { setQuery(''); $('searchInput').focus(); });
    // 한글은 조합이 끝난 뒤에 반영해야 글자가 깨지지 않는다
    let composing = false;
    const input = $('searchInput');
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; setQuery(input.value); });
    input.addEventListener('input', () => { if (!composing) setQuery(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); openSearch(false); } });
    $('viewSeg').replaceChildren(...[['list', '목록', 'list'], ['columns', '계층', 'columns'], ['gallery', '갤러리', 'gallery']].map(([m, label, ic]) =>
      h('button', { 'data-mode': m, title: `${label}으로 보기`, 'aria-label': `${label}으로 보기`, onclick: () => setMode(m) }, icon(ic))));
  }
  function renderTools() {
    $('tbTools').hidden = !browsing();
    for (const b of $('viewSeg').children) b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode));
  }
  // 계층 · 갤러리에서의 키보드: 화살표로 이동, 스페이스로 미리보기, 리턴으로 고르기
  document.addEventListener('keydown', (e) => {
    if (!browsing() || S.mode === 'list' || !NAV || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, .modal')) return;
    const { kind } = NAV;
    let handled = true;
    if (S.mode === 'gallery') {
      const move = (d) => { const x = NAV.flat[NAV.at + d]; if (x) pick(kind, x.s.id, x.i.path); };
      const x = NAV.flat[NAV.at];
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(-1);
      else if (e.key === ' ' && x) preview(x.i.path);
      else if (e.key === 'Enter' && x) { if (toggleItem(x.s, x.i, !goneFn()(x.i.path))) render(); } else handled = false;
    } else {
      const { secs, sec, it, items } = NAV;
      const moveItem = (d) => { const n = items[items.indexOf(it) + d]; if (n) pick(kind, sec.id, n.path); };
      const moveSec = (d) => { const n = secs[secs.indexOf(sec) + d]; if (n) pick(kind, n.id); };
      if (e.key === 'ArrowDown') moveItem(1);
      else if (e.key === 'ArrowUp') moveItem(-1);
      else if (e.key === 'ArrowRight') moveSec(1);
      else if (e.key === 'ArrowLeft') moveSec(-1);
      else if (e.key === ' ' && it) preview(it.path);
      else if (e.key === 'Enter' && it) { if (toggleItem(sec, it, !goneFn()(it.path))) render(); } else handled = false;
    }
    if (handled) e.preventDefault();
  });

  // ---------- 최적화: 맥 상태 · 무거운 프로그램 · 자동 실행 ----------
  const O = { health: null, procs: null, startup: null, sort: 'cpu', loading: false, timer: null };
  async function loadOptimize(all) {
    if (O.loading) return;
    O.loading = true;
    try {
      const jobs = [api.optProcesses().then((v) => { O.procs = v; })];
      if (all || !O.health) jobs.push(api.optHealth().then((v) => { O.health = v; }));
      if (all || !O.startup) jobs.push(api.optStartup().then((v) => { O.startup = v; }));
      await Promise.all(jobs.map((j) => j.catch(() => {})));
    } finally { O.loading = false; }
    if (S.view === 'opt') renderMain();
  }
  // 최적화 탭을 보고 있는 동안에만 무거운 프로그램 목록을 5초마다 새로 읽는다
  function watchOptimize() {
    const on = S.view === 'opt';
    if (on && !O.timer) { loadOptimize(false); O.timer = setInterval(() => { if (!document.querySelector('.overlay')) loadOptimize(false); }, 5000); }
    if (!on && O.timer) { clearInterval(O.timer); O.timer = null; }
  }
  const HEALTH_ICON = { disk: 'disk', memory: 'memory', uptime: 'timer', battery: 'battery' };
  const STATUS_WORD = { good: '좋음', warn: '살펴보기', bad: '조치 필요' };
  async function quitApp(g) {
    const ok = await modal({
      glyph: 'power', title: `${g.name}을(를) 종료할까요?`,
      body: '앱에 종료를 요청해요. 저장하지 않은 작업이 있으면 앱이 먼저 물어봐요.',
      confirm: '종료 요청',
    });
    if (!ok) return;
    const res = await api.optQuit(g.name);
    if (res.ok) { toast(`${g.name}에 종료를 요청했어요.`); setTimeout(() => loadOptimize(false), 1500); } else toast(res.reason || '종료하지 못했어요.');
  }
  async function disableStartup(it) {
    const ok = await modal({
      glyph: 'power', title: `${it.name}의 자동 실행을 끌까요?`,
      body: it.kind === 'login' ? '맥을 켤 때 이 앱이 함께 열리지 않게 돼요. 앱 자체는 지워지지 않아요.'
        : '맥을 켤 때 이 프로그램이 뒤에서 실행되지 않게 돼요. 설정 파일을 휴지통으로 옮기므로, 문제가 생기면 휴지통에서 되돌릴 수 있어요.',
      confirm: '자동 실행 끄기',
    });
    if (!ok) return;
    const res = await api.optDisable(it.id);
    if (res.ok) { O.startup = O.startup.filter((x) => x.id !== it.id); toast(`${it.name}의 자동 실행을 껐어요.`); renderMain(); } else toast(res.reason || '끄지 못했어요.', { label: '설정 열기', run: () => api.openLoginSettings() });
  }
  function viewOptimize() {
    const out = [h('p', { class: 'lead' }, '맥이 느려지는 흔한 원인 세 가지를 살펴봐요. 여기서는 파일을 지우지 않아요.')];

    // 1) 맥 상태
    out.push(h('div', { class: 'caption' }, '맥 상태'));
    if (!O.health) out.push(h('div', { class: 'box' }, [0, 1, 2].map(() => h('div', { class: 'skel' }, h('i'), h('i'), h('i')))));
    else {
      out.push(h('div', { class: 'box health' }, O.health.map((c) => h('div', { class: 'cell tiled' },
        h('span', { class: 'tile ghost' }, icon(HEALTH_ICON[c.id] || 'gauge')),
        h('div', { class: 'text' },
          h('div', { class: 't' }, c.title, h('span', { class: 'state ' + c.status }, h('i'), STATUS_WORD[c.status])),
          h('div', { class: 'd wrap' }, c.advice)),
        h('span', { class: 'v num' }, c.value),
        c.action === 'goHome' && h('button', { class: 'btn small', onclick: () => go('home') }, '정리하러 가기')))));
    }

    // 2) 지금 무거운 프로그램
    out.push(h('div', { class: 'caption' }, '지금 무거운 프로그램',
      h('span', { class: 'side' }, '5초마다 새로 확인해요')));
    if (!O.procs) out.push(h('div', { class: 'box' }, [0, 1, 2].map(() => h('div', { class: 'skel' }, h('i'), h('i'), h('i')))));
    else {
      const by = O.sort === 'mem' ? (a, b) => b.mem - a.mem : (a, b) => b.cpu - a.cpu;
      // 아무것도 쓰지 않는 항목(시스템 내부 작업 등)은 목록에서 뺀다
      const top = O.procs.items.filter((g) => g.mem > 0 || g.cpu > 0.5).sort(by).slice(0, 6);
      const maxCpu = O.procs.cores * 100;
      out.push(h('div', { class: 'box procs' },
        h('div', { class: 'cat-tools' },
          h('span', {}, '많이 쓰는 순서'),
          h('div', { class: 'seg' }, [['cpu', '처리 장치(CPU)'], ['mem', '메모리']].map(([v, l]) =>
            h('button', { 'aria-pressed': String(O.sort === v), onclick: () => { O.sort = v; renderMain(); } }, l))),
          h('span', { class: 'grow' })),
        top.map((g) => {
          const share = O.sort === 'mem' ? g.mem / O.procs.totalMem : g.cpu / maxCpu;
          return h('div', { class: 'cell tiled' },
            h('span', { class: 'tile ghost' }, icon(g.isApp ? 'gauge' : 'cpu')),
            h('div', { class: 'text' },
              h('div', { class: 't' }, g.name, g.count > 1 && h('span', { class: 'chipq num' }, `${g.count}개`)),
              h('div', { class: 'meter' }, h('i', { class: share > 0.5 ? 'hot' : '', style: `transform:scaleX(${Math.min(1, Math.max(0.01, share))})` }))),
            h('span', { class: 'v num two' }, h('b', {}, `${g.cpu.toFixed(0)}%`), h('span', {}, fmt(g.mem))),
            g.canQuit ? h('button', { class: 'btn small', onclick: () => quitApp(g) }, '종료')
              : h('span', { class: 'hint' }, g.mine ? '' : '시스템'));
        })));
      out.push(h('p', { class: 'foot' }, '맥이 꼭 필요로 하는 시스템 프로그램에는 종료 버튼이 없어요. 종료는 앱에 정중히 요청하는 방식이라 저장하지 않은 작업은 앱이 먼저 물어봐요.'));
    }

    // 3) 자동 실행
    out.push(h('div', { class: 'caption' }, '맥을 켤 때 자동으로 실행',
      h('button', { class: 'btn small plain', onclick: () => api.openLoginSettings() }, icon('settings'), '시스템 설정에서 보기')));
    if (!O.startup) out.push(h('div', { class: 'box' }, [0, 1].map(() => h('div', { class: 'skel' }, h('i'), h('i'), h('i')))));
    else if (!O.startup.length) {
      out.push(h('div', { class: 'box' }, h('div', { class: 'cell' }, h('div', { class: 'text' },
        h('div', { class: 't' }, '자동으로 실행되는 항목을 찾지 못했어요'),
        h('div', { class: 'd wrap' }, '앱이 직접 등록한 항목은 시스템 설정 → 일반 → 로그인 항목에서도 확인할 수 있어요.')))));
    } else {
      out.push(h('div', { class: 'box startup' }, O.startup.map((it) => h('div', { class: 'cell tiled' },
        h('span', { class: 'tile ghost' }, icon('power')),
        h('div', { class: 'text' },
          h('div', { class: 't' }, it.name, h('span', { class: 'chipq' }, it.kind === 'login' ? '로그인할 때 열림' : it.scope === 'system' ? '뒤에서 실행 · 시스템 전체' : '뒤에서 실행')),
          h('div', { class: 'd', title: it.detail }, it.detail)),
        it.scope === 'user' ? h('button', { class: 'btn small', onclick: () => disableStartup(it) }, '끄기')
          : h('button', { class: 'btn small plain', onclick: () => api.openLoginSettings() }, '설정에서 끄기')))));
      out.push(h('p', { class: 'foot' }, '무엇인지 모르는 항목은 그대로 두는 편이 안전해요. 시스템 전체에 설치된 항목은 맥 보안 때문에 시스템 설정에서만 끌 수 있어요.'));
    }
    return out;
  }

  // ---------- 그리기: 전체 ----------
  function renderMain() {
    const main = $('main');
    const top = main.scrollTop;
    const scrolls = {};
    for (const el of main.querySelectorAll('[data-scroll]')) scrolls[el.dataset.scroll] = [el.scrollTop, el.scrollLeft];
    NAV = null;
    const kids = S.view === 'home' ? viewHome() : S.view === 'opt' ? viewOptimize() : viewBrowse(S.view);
    watchOptimize();
    const fill = browsing() && S.mode !== 'list' && !!NAV; // 계층 · 갤러리는 칸마다 따로 스크롤한다
    main.classList.toggle('fill', fill);
    main.replaceChildren(h('div', { class: 'wrap' + (S.animate ? ' fresh' : '') + (fill ? ' fill' : '') }, kids));
    const fresh = S.animate;
    S.animate = false;
    main.scrollTop = top;
    for (const el of main.querySelectorAll('[data-scroll]')) {
      const v = scrolls[el.dataset.scroll];
      if (v && !fresh) { el.scrollTop = v[0]; el.scrollLeft = v[1]; }
    }
    // 지금 보고 있는 항목이 화면 밖이면 보이게 한다
    for (const el of main.querySelectorAll('.col [aria-selected="true"], .strip [aria-selected="true"]')) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    renderToolbar();
    renderProgress();
  }
  function renderBar() {
    const bar = $('actionbar');
    const n = S.selected.size;
    bar.hidden = n === 0;
    if (!n) return;
    bar.replaceChildren(
      h('div', { class: 'info num' }, h('b', {}, `${nf.format(n)}개 선택`), h('span', {}, fmt(selTotal()))),
      h('button', { class: 'btn plain', disabled: S.busy, onclick: () => { S.selected.clear(); render(); } }, '선택 해제'),
      h('button', { class: 'btn primary', id: 'trashBtn', disabled: S.busy, onclick: trashSelected }, icon('trash'), S.busy ? '옮기는 중…' : '휴지통으로 이동'));
  }
  function render() { renderSide(); renderMain(); renderBar(); }

  // ---------- 시작 ----------
  // 맥에서 사용자가 고른 강조색을 그대로 따른다
  function applyAccent(hex) {
    if (hex) document.documentElement.style.setProperty('--accent', hex);
  }
  if (api.platform !== 'darwin') document.documentElement.classList.add('opaque');
  if (api.accent) api.accent().then(applyAccent).catch(() => {});
  if (api.onAccent) api.onAccent(applyAccent);
  if (api.onMenuScan) api.onMenuScan(startScan);
  if (api.onMenuTrash) api.onMenuTrash(trashSelected);
  if (api.onMenuFind) api.onMenuFind(() => { if (browsing()) openSearch(true); });
  try { const v = JSON.parse(localStorage.getItem('sort')); if (v && SORT_COLS.some(([k]) => k === v.key)) S.sort = { key: v.key, dir: v.dir > 0 ? 1 : -1 }; } catch { /* 기본값 사용 */ }
  try { const m = localStorage.getItem('mode'); if (['list', 'columns', 'gallery'].includes(m)) S.mode = m; } catch { /* 기본값 사용 */ }
  setupTools();
  render();
  refreshDisk();
})();
