'use strict';
/* 말끔 — 화면 동작. 프레임워크 없이 작성했고, 파일 이름은 항상 textContent로만 넣는다. */
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
    dupShown: 40,
    openCats: new Set(),
    catShown: {},
    busy: false,
  };

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
  function icon(d, cls) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    for (const part of d.split('|')) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', part);
      s.append(p);
    }
    return s;
  }
  const I = {
    home: 'M3 11l9-8 9 8|M5 10v10h14V10',
    copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
    spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z|M19 17v4|M17 19h4',
    chev: 'M9 6l6 6-6 6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14z|M20 20l-4-4',
  };

  function fmt(bytes) {
    if (!bytes || bytes < 0) return '0KB';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let v = bytes / 1000;
    let i = 0;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : i >= 2 ? 2 : 1;
    return v.toFixed(digits).replace(/\.0+$/, '') + u[i];
  }
  const nf = new Intl.NumberFormat('ko-KR');
  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  function split(p) {
    const i = p.lastIndexOf('/');
    let dir = p.slice(0, i) || '/';
    if (S.disk.home && (dir === S.disk.home || dir.startsWith(S.disk.home + '/'))) dir = '~' + dir.slice(S.disk.home.length);
    return { dir, name: p.slice(i + 1) };
  }
  const selTotal = () => { let n = 0; for (const v of S.selected.values()) n += v; return n; };

  // ---------- 알림 · 대화상자 ----------
  function toast(msg, action) {
    const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, msg));
    if (action) t.append(h('button', { onclick: () => { t.remove(); action.run(); } }, action.label));
    $('toastRoot').replaceChildren(t);
    setTimeout(() => t.remove(), action ? 12000 : 4500);
  }
  function modal({ title, body, list, confirm, cancel = '취소', danger }) {
    return new Promise((resolve) => {
      const close = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => close(true) }, confirm);
      const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(false); } },
        h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('h2', {}, title),
          body && h('p', {}, body),
          list && h('ul', {}, list.map((r) => h('li', {}, r.title, h('span', {}, r.sub)))),
          h('div', { class: 'btns' }, cancel && h('button', { class: 'btn', onclick: () => close(false) }, cancel), okBtn)));
      document.addEventListener('keydown', onKey);
      $('modalRoot').append(ov);
      okBtn.focus();
    });
  }

  // ---------- 검사 ----------
  async function startScan() {
    S.scanning = true; S.error = null; S.result = null; S.progress = { phase: 'walk', files: 0 };
    S.selected.clear(); S.dupShown = 40; S.catShown = {}; S.view = 'home';
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
    S.scanning = false; S.progress = null;
    if (r) {
      S.result = r;
      S.openCats = new Set(r.categories.slice(0, 1).map((c) => c.id));
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
    renderSide();
    if (S.view === 'home' && !S.scanning) renderMain();
  }

  // ---------- 선택 ----------
  function toggle(path, size, on) {
    if (on) S.selected.set(path, size); else S.selected.delete(path);
  }
  function autoSelect(rule) {
    for (const g of S.result.groups) {
      const sorted = [...g.files].sort((a, b) => a.mtimeMs - b.mtimeMs);
      const keep = rule === 'newest' ? sorted[sorted.length - 1] : sorted[0];
      for (const f of g.files) toggle(f.path, f.size, f !== keep);
    }
    render();
  }
  function clearDupSelection() {
    for (const g of S.result.groups) for (const f of g.files) S.selected.delete(f.path);
    render();
  }

  // ---------- 삭제 ----------
  async function trashSelected() {
    if (S.busy || !S.selected.size) return;
    const count = S.selected.size;
    const ok = await modal({
      title: `${nf.format(count)}개 항목을 휴지통으로 옮길까요?`,
      body: `약 ${fmt(selTotal())}를 정리해요. 바로 지워지지 않고 휴지통으로 가니, 잘못 골랐다면 휴지통에서 다시 꺼낼 수 있어요.`,
      confirm: '휴지통으로 이동',
    });
    if (!ok) return;
    S.busy = true; renderBar();
    let res;
    try {
      res = await api.trash([...S.selected.keys()]);
    } catch {
      res = { trashed: [], failed: [], freed: 0, crashed: true };
    }
    S.busy = false;
    applyTrashed(res.trashed, res.freed);
    render();
    refreshDisk();
    if (res.crashed) {
      await modal({ title: '옮기는 중 문제가 생겼어요', body: '아무것도 지워지지 않았어요. 다시 검사한 뒤 시도해 주세요.', confirm: '확인', cancel: null });
    } else if (res.failed.length) {
      await modal({
        title: `${nf.format(res.failed.length)}개 항목은 그대로 뒀어요`,
        body: res.trashed.length ? `나머지 ${nf.format(res.trashed.length)}개(${fmt(res.freed)})는 휴지통으로 옮겼어요.` : '안전을 위해 옮기지 않았어요.',
        list: res.failed.slice(0, 30).map((f) => ({ title: split(f.path).name, sub: f.reason })),
        confirm: '확인', cancel: null,
      });
    }
    if (res.trashed.length) {
      toast(`${fmt(res.freed)}를 휴지통으로 옮겼어요. 휴지통을 비우면 공간이 확보돼요.`, { label: '휴지통 비우기', run: emptyTrash });
    }
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
    r.summary.dupGroups = r.groups.length;
    r.summary.dupFiles = r.groups.reduce((n, g) => n + g.files.length - 1, 0);
    r.summary.dupWasted = r.groups.reduce((n, g) => n + g.wasted, 0);
    r.summary.recoTotal = r.categories.reduce((n, c) => n + c.total, 0);
  }
  async function emptyTrash() {
    const ok = await modal({
      title: '휴지통을 비울까요?',
      body: '휴지통 안의 모든 항목이 완전히 지워지고, 되돌릴 수 없어요.',
      confirm: '휴지통 비우기', danger: true,
    });
    if (!ok) return;
    const res = await api.emptyTrash();
    if (res.ok) {
      if (S.result) {
        S.result.categories = S.result.categories.filter((c) => c.id !== 'trash');
        S.result.summary.recoTotal = S.result.categories.reduce((n, c) => n + c.total, 0);
      }
      render();
      setTimeout(refreshDisk, 1200);
      toast('휴지통을 비웠어요. 공간이 확보됐어요.');
    } else {
      toast(res.reason || '휴지통을 비우지 못했어요.', { label: '휴지통 열기', run: () => api.openTrash() });
    }
  }

  // ---------- 그리기: 사이드바 ----------
  function renderSide() {
    const r = S.result;
    const items = [
      { id: 'home', label: '개요', icon: I.home },
      { id: 'dups', label: '중복 파일', icon: I.copy, badge: r && r.groups.length ? fmt(r.summary.dupWasted) : null },
      { id: 'reco', label: '정리 추천', icon: I.spark, badge: r && r.summary.recoTotal ? fmt(r.summary.recoTotal) : null },
    ];
    $('nav').replaceChildren(...items.map((it) =>
      h('button', {
        class: 'nav-item', 'aria-current': S.view === it.id ? 'page' : null,
        onclick: () => { S.view = it.id; render(); $('main').scrollTop = 0; },
      }, icon(it.icon), h('span', { class: 'label' }, it.label), it.badge && h('span', { class: 'badge num' }, it.badge))));
    const d = S.disk;
    if (d.total) {
      const usedPct = Math.min(100, Math.max(0, (1 - d.free / d.total) * 100));
      $('sideDisk').replaceChildren(
        h('div', {}, '남은 공간 ', h('b', { class: 'num' }, fmt(d.free))),
        h('div', { class: 'meter ' + level(d) }, h('i', { style: `width:${usedPct}%` })),
        h('div', { class: 'num' }, `전체 ${fmt(d.total)}`));
    } else $('sideDisk').replaceChildren();
  }
  function level(d) {
    const freePct = d.total ? d.free / d.total : 1;
    return freePct < 0.1 ? 'low' : freePct < 0.2 ? 'mid' : '';
  }

  // ---------- 그리기: 개요 ----------
  function viewHome() {
    const d = S.disk;
    const usedPct = d.total ? Math.min(100, (1 - d.free / d.total) * 100) : 0;
    const lv = level(d);
    const freeTxt = fmt(d.free);
    const m = freeTxt.match(/^([\d.]+)(\D+)$/) || [null, freeTxt, ''];
    const hero = h('div', { class: 'card hero' },
      h('div', { class: 'hero-top' },
        h('div', { class: 'hero-free num' }, m[1], h('small', {}, m[2])),
        h('span', { class: 'hero-cap' }, '남았어요'),
        lv === 'low' && h('span', { class: 'pill low' }, '공간이 많이 부족해요'),
        lv === 'mid' && h('span', { class: 'pill review' }, '공간이 줄어들고 있어요')),
      h('div', { class: 'meter ' + lv }, h('i', { style: `width:${usedPct}%` })),
      h('div', { class: 'hero-legend num' },
        h('span', {}, `사용 중 ${fmt(d.total - d.free)}`), h('span', {}, `전체 ${fmt(d.total)}`)));

    const box = h('div', { class: 'card scan-box' });
    if (S.scanning) {
      box.append(h('div', { class: 'progress', id: 'progress' }));
    } else {
      const r = S.result;
      box.append(h('div', { class: 'scan-row' },
        h('div', { class: 'grow' },
          h('h2', {}, r ? '검사를 마쳤어요' : '무엇을 정리할 수 있는지 찾아볼게요'),
          h('p', {}, r
            ? `파일 ${nf.format(r.summary.files)}개를 ${Math.max(1, Math.round(r.summary.elapsedMs / 1000))}초 동안 살펴봤어요.`
            : '검사만으로는 아무것도 지워지지 않아요. 결과를 보고 직접 고르면 돼요.')),
        h('button', { class: 'btn primary ' + (r ? '' : 'big'), id: 'scanBtn', onclick: startScan }, icon(I.search), r ? '다시 검사' : '검사 시작')));
      box.append(h('div', { class: 'opts' },
        h('div', {},
          h('div', { class: 'opt-label' }, '검사할 곳'),
          h('div', { class: 'seg' },
            h('button', { 'aria-pressed': String(!S.roots.length), onclick: () => { S.roots = []; renderMain(); } }, '홈 폴더 전체'),
            h('button', { 'aria-pressed': String(!!S.roots.length), onclick: pickFolders }, '폴더 직접 선택…')),
          S.roots.length ? h('div', { class: 'chips' }, S.roots.map((p) => h('span', { class: 'chip', title: p }, split(p + '/x').dir))) : null),
        h('div', {},
          h('div', { class: 'opt-label' }, '중복으로 볼 최소 크기'),
          h('div', { class: 'seg' }, [[100e3, '100KB'], [1e6, '1MB'], [10e6, '10MB']].map(([v, l]) =>
            h('button', { 'aria-pressed': String(S.minDupSize === v), onclick: () => { S.minDupSize = v; renderMain(); } }, l))))));
    }

    const out = [h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', {}, '저장공간 개요'), h('p', {}, '중복 파일과 지워도 되는 파일을 찾아 공간을 되찾아요.'))), hero, box];
    if (S.error) out.push(h('div', { class: 'note warn' }, h('span', { class: 'grow' }, `검사 중 문제가 생겼어요: ${S.error}`), h('button', { class: 'btn small', onclick: startScan }, '다시 시도')));

    const r = S.result;
    if (r && !S.scanning) {
      out.push(h('div', { class: 'summary' },
        h('button', { class: 'card sum-card', onclick: () => { S.view = 'dups'; render(); } },
          h('div', { class: 'k' }, '중복 파일'),
          h('div', { class: 'v num' }, fmt(r.summary.dupWasted)),
          h('div', { class: 'd' }, r.groups.length ? `똑같은 파일 ${nf.format(r.summary.dupFiles)}개를 지울 수 있어요` : '중복된 파일이 없어요'),
          h('span', { class: 'go' }, '확인하기 →')),
        h('button', { class: 'card sum-card', onclick: () => { S.view = 'reco'; render(); } },
          h('div', { class: 'k' }, '정리 추천'),
          h('div', { class: 'v num' }, fmt(r.summary.recoTotal)),
          h('div', { class: 'd' }, r.categories.length ? `${r.categories.length}가지 종류에서 찾았어요` : '추천할 항목이 없어요'),
          h('span', { class: 'go' }, '확인하기 →'))));
      if (r.summary.denied.length) {
        out.push(h('div', { class: 'note warn' },
          h('span', { class: 'grow' }, `폴더 ${nf.format(r.summary.denied.length)}곳은 권한이 없어 건너뛰었어요. 더 꼼꼼히 찾으려면 '전체 디스크 접근 권한'에서 말끔을 켜 주세요.`),
          h('button', { class: 'btn small', onclick: () => api.openPrivacySettings() }, '설정 열기')));
      }
    }
    out.push(h('p', { class: 'meta' }, '시스템 파일, 앱, 사진 보관함, 숨김 폴더는 검사하지도 지우지도 않아요.'));
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
    const order = ['walk', 'hash', 'recommend'];
    const idx = order.indexOf(p.phase);
    let title; let sub = ''; let pct = null;
    if (p.phase === 'walk') {
      title = `파일을 살펴보는 중 · ${nf.format(p.files || 0)}개`;
      sub = p.current || '';
    } else if (p.phase === 'hash') {
      title = '똑같은 파일인지 비교하는 중';
      if (p.total) pct = Math.min(100, (p.done / p.total) * (p.step === 'quick' ? 15 : 85) + (p.step === 'quick' ? 0 : 15));
      sub = p.step === 'full' ? `${fmt(p.done)} / ${fmt(p.total)}` : '';
    } else {
      title = '정리할 만한 항목을 찾는 중';
      sub = p.label || '';
    }
    el.replaceChildren(
      h('div', { class: 'scan-row' },
        h('div', { class: 'grow', style: 'min-width:0' }, h('h2', { class: 'num' }, title), h('div', { class: 'sub num' }, '‎' + sub)),
        h('button', { class: 'btn', onclick: cancelScan }, '중단')),
      h('div', { class: 'bar' + (pct == null ? ' indet' : '') }, h('i', { style: pct == null ? '' : `width:${pct}%` })),
      h('div', { class: 'steps' }, ['파일 살펴보기', '중복 비교', '정리 추천'].map((l, i) =>
        h('span', { class: i === idx ? 'on' : i < idx ? 'done' : '' }, `${i + 1}. ${l}`))));
  }

  // ---------- 그리기: 빈 화면 ----------
  function emptyState(title, body, withScan) {
    return h('div', { class: 'empty' }, icon(withScan ? I.search : I.check),
      h('h2', {}, title), h('p', {}, body),
      withScan && h('div', {}, h('button', { class: 'btn primary', onclick: startScan }, '검사 시작')));
  }
  function fileRow(item, { keepBadge, onToggle, canCheck = true } = {}) {
    const { dir, name } = split(item.path);
    const on = S.selected.has(item.path);
    const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': `${name} 선택`, onchange: (e) => onToggle(e.target.checked, e.target) });
    return h('label', { class: 'row' + (on ? ' picked' : '') },
      canCheck && cb,
      h('div', { class: 'file' }, h('div', { class: 'name', title: item.path }, item.name || name), h('div', { class: 'dir' }, dir)),
      keepBadge && !on && h('span', { class: 'keep' }, '남김'),
      h('button', { class: 'btn small ghost reveal', onclick: (e) => { e.preventDefault(); api.reveal(item.path); } }, 'Finder에서 보기'),
      h('span', { class: 'date num' }, fmtDate(item.mtimeMs)),
      h('span', { class: 'size num' }, fmt(item.size)));
  }

  // ---------- 그리기: 중복 파일 ----------
  function viewDups() {
    const head = h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', {}, '중복 파일'),
      h('p', {}, '내용이 한 글자도 다르지 않은 파일끼리 묶었어요. 묶음마다 하나는 꼭 남겨요.')));
    if (S.scanning) return [head, emptyState('검사하는 중이에요', '끝나면 여기에 결과가 나타나요.')];
    if (!S.result) return [head, emptyState('아직 검사하지 않았어요', '검사를 하면 똑같은 파일을 찾아드려요.', true)];
    const groups = S.result.groups;
    if (!groups.length) return [head, emptyState('중복된 파일이 없어요', '똑같은 파일을 찾지 못했어요. 깔끔하네요!')];

    const out = [head, h('div', { class: 'toolbar' },
      h('span', {}, `묶음 ${nf.format(groups.length)}개 · 최대 ${fmt(S.result.summary.dupWasted)} 절약`),
      h('span', { class: 'grow' }),
      h('span', {}, '자동 선택'),
      h('button', { class: 'btn small', onclick: () => autoSelect('oldest') }, '가장 오래된 것만 남기기'),
      h('button', { class: 'btn small', onclick: () => autoSelect('newest') }, '가장 최근 것만 남기기'),
      h('button', { class: 'btn small ghost', onclick: clearDupSelection }, '선택 해제'))];

    for (const g of groups.slice(0, S.dupShown)) {
      const picked = g.files.filter((f) => S.selected.has(f.path)).length;
      const card = h('div', { class: 'card group' },
        h('div', { class: 'group-head' },
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, split(g.files[0].path).name),
            h('div', { class: 'sub num' }, `똑같은 파일 ${g.files.length}개 · 각 ${fmt(g.size)}`)),
          h('div', { class: 'save num' }, picked ? `${fmt(picked * g.size)} 선택됨` : `${fmt(g.wasted)} 절약 가능`)),
        g.files.map((f) => fileRow(f, {
          keepBadge: picked > 0,
          onToggle: (on, el) => {
            const others = g.files.filter((x) => x !== f && !S.selected.has(x.path)).length;
            if (on && others === 0) {
              el.checked = false;
              toast('똑같은 파일 중 하나는 꼭 남겨야 해요.');
              return;
            }
            toggle(f.path, f.size, on); render();
          },
        })));
      out.push(card);
    }
    if (groups.length > S.dupShown) {
      out.push(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => { S.dupShown += 60; renderMain(); } }, `묶음 ${nf.format(groups.length - S.dupShown)}개 더 보기`)));
    }
    return out;
  }

  // ---------- 그리기: 정리 추천 ----------
  function viewReco() {
    const head = h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', {}, '정리 추천'),
      h('p', {}, '지워도 괜찮은 것부터 순서대로 보여드려요. 원하는 것만 골라서 정리하세요.')));
    if (S.scanning) return [head, emptyState('검사하는 중이에요', '끝나면 여기에 결과가 나타나요.')];
    if (!S.result) return [head, emptyState('아직 검사하지 않았어요', '검사를 하면 지워도 되는 파일을 추천해 드려요.', true)];
    const cats = S.result.categories;
    if (!cats.length) return [head, emptyState('추천할 항목이 없어요', '정리할 만한 파일을 찾지 못했어요.')];

    const out = [head];
    for (const c of cats) {
      const open = S.openCats.has(c.id);
      const picked = c.items.filter((i) => S.selected.has(i.path));
      const card = h('div', { class: 'card group cat' + (open ? ' open' : '') },
        h('button', { class: 'cat-head', 'aria-expanded': String(open), onclick: () => { open ? S.openCats.delete(c.id) : S.openCats.add(c.id); renderMain(true); } },
          icon(I.chev, 'chev'),
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, c.title, h('span', { class: 'pill ' + c.safety }, c.safety === 'safe' ? '지워도 안전' : '확인 후 삭제')),
            h('div', { class: 'desc' }, c.desc)),
          h('div', { class: 'total num' }, c.unknownSize ? '크기 확인 불가' : fmt(c.total))));
      if (open) {
        const body = h('div', { class: 'cat-body' });
        if (c.action === 'emptyTrash') {
          body.append(h('div', { class: 'cat-actions' },
            h('button', { class: 'btn danger', onclick: emptyTrash }, '휴지통 비우기'),
            h('button', { class: 'btn', onclick: () => api.openTrash() }, '휴지통 열어보기')));
        } else {
          const all = picked.length === c.items.length;
          body.append(h('div', { class: 'cat-tools' },
            h('label', {}, h('input', {
              type: 'checkbox', checked: all, indeterminate: picked.length > 0 && !all,
              onchange: (e) => { for (const i of c.items) toggle(i.path, i.size, e.target.checked); render(); },
            }), `전체 선택 (${nf.format(c.items.length)}개)`),
            h('span', { style: 'flex:1' }),
            picked.length ? h('span', { class: 'num' }, `${nf.format(picked.length)}개 · ${fmt(picked.reduce((n, i) => n + i.size, 0))} 선택됨`) : null));
          const shown = S.catShown[c.id] || 30;
          for (const i of c.items.slice(0, shown)) {
            body.append(fileRow(i, { onToggle: (on) => { toggle(i.path, i.size, on); render(); } }));
          }
          if (c.items.length > shown) {
            body.append(h('div', { class: 'more' }, h('button', { class: 'btn small', onclick: () => { S.catShown[c.id] = shown + 100; renderMain(true); } }, `${nf.format(c.items.length - shown)}개 더 보기`)));
          }
        }
        card.append(body);
      }
      out.push(card);
    }
    return out;
  }

  // ---------- 그리기: 전체 ----------
  function renderMain(keepScroll) {
    const main = $('main');
    const top = main.scrollTop;
    const kids = S.view === 'dups' ? viewDups() : S.view === 'reco' ? viewReco() : viewHome();
    main.replaceChildren(h('div', { class: 'wrap' }, kids));
    if (keepScroll !== false) main.scrollTop = top;
    renderProgress();
  }
  function renderBar() {
    const bar = $('actionbar');
    const n = S.selected.size;
    bar.hidden = n === 0;
    if (!n) return;
    bar.replaceChildren(
      h('div', { class: 'info' }, h('b', { class: 'num' }, `${fmt(selTotal())} 정리 예정`), h('span', { class: 'num' }, `${nf.format(n)}개 항목 선택됨`)),
      h('button', { class: 'btn ghost', disabled: S.busy, onclick: () => { S.selected.clear(); render(); } }, '선택 해제'),
      h('button', { class: 'btn primary', id: 'trashBtn', disabled: S.busy, onclick: trashSelected }, S.busy ? '옮기는 중…' : '휴지통으로 이동'));
  }
  function render() { renderSide(); renderMain(); renderBar(); }

  // ---------- 시작 ----------
  render();
  refreshDisk();
})();
