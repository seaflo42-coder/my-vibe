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
    animate: true,        // 화면이 바뀔 때만 등장 효과를 준다
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
    s.setAttribute('stroke-width', '1.8');
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
    disk: 'M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5z|M4 14h16|M7.5 17h.01',
    copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
    spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z|M19 17v4|M17 19h4',
    chev: 'M9 6l6 6-6 6',
    check: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M8 12.5l3 3 5-6',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14z|M20 20l-4-4',
    trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    down: 'M12 3v11|M7.5 10l4.5 4.5 4.5-4.5|M4 20h16',
    bolt: 'M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z',
    doc: 'M6 3h8l4 4v14H6z|M9 12h6|M9 16h6',
    wrench: 'M14.5 6.5a4 4 0 00-5 5L3 18l3 3 6.5-6.5a4 4 0 005-5l-2.5 2.5-2.5-.5-.5-2.5z',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18z|M12 7.5V12l3 2',
    phone: 'M8 2.5h8a1 1 0 011 1v17a1 1 0 01-1 1H8a1 1 0 01-1-1v-17a1 1 0 011-1z|M11 18.5h2',
    expand: 'M4 14v6h6|M20 10V4h-6|M4 20l7-7|M20 4l-7 7',
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
    if (action) t.append(h('button', { class: 'btn small', onclick: () => { t.remove(); action.run(); } }, action.label));
    $('toastRoot').replaceChildren(t);
    setTimeout(() => t.remove(), action ? 12000 : 4500);
  }
  function appIcon() {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 56 56'); s.setAttribute('class', 'appicon'); s.setAttribute('aria-hidden', 'true');
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('width', '56'); r.setAttribute('height', '56'); r.setAttribute('rx', '13'); r.setAttribute('fill', 'rgba(255,255,255,.94)');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M17 29l8 8 14-17'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#15161d');
    p.setAttribute('stroke-width', '5'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(r, p);
    return s;
  }
  // macOS 경고창 모양: 앱 아이콘, 굵은 제목, 설명, 아래쪽에 나란한 버튼(기본 동작이 오른쪽)
  function modal({ title, body, list, confirm, cancel = '취소', danger }) {
    return new Promise((resolve) => {
      const close = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => close(true) }, confirm);
      const ov = h('div', { class: 'overlay', onclick: (e) => { if (e.target === ov) close(false); } },
        h('div', { class: 'modal' + (list ? ' wide' : ''), role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
          appIcon(),
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
    S.selected.clear(); S.dupShown = 40; S.catShown = {}; S.view = 'home'; S.animate = true;
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
  function go(view, openCat) {
    S.view = view; S.animate = true;
    if (openCat) S.openCats = new Set([openCat]);
    render();
    $('main').scrollTop = 0;
  }
  // 저장공간을 구간으로 나눈다: 사용 중 / 중복 / 지워도 안전 / 확인 후 삭제 / 남음
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
  function storageBar(cls) {
    const p = parts();
    const seg = (k) => p[k] > 0 && h('i', { class: 's-' + k, style: `flex:${p[k]} 1 0` });
    return h('div', { class: cls }, seg('used'), seg('dup'), seg('safe'), seg('review'), h('i', { class: 's-free', style: `flex:${Math.max(p.free, 1)} 1 0` }));
  }
  function renderSide() {
    const r = S.result;
    const items = [
      { id: 'home', label: '저장공간', icon: I.disk },
      { id: 'dups', label: '중복 파일', icon: I.copy, badge: r && r.groups.length ? fmt(r.summary.dupWasted) : null },
      { id: 'reco', label: '정리 추천', icon: I.spark, badge: r && r.summary.recoTotal ? fmt(r.summary.recoTotal) : null },
    ];
    $('nav').replaceChildren(...items.map((it) =>
      h('button', { class: 'nav-item', 'aria-current': S.view === it.id ? 'page' : null, onclick: () => go(it.id) },
        icon(it.icon), h('span', { class: 'label' }, it.label))));
  }

  // ---------- 그리기: 도구 막대 ----------
  function renderToolbar() {
    const r = S.result;
    const kids = [];
    if (S.view === 'home') {
      kids.push(h('h1', {}, '저장공간'), h('span', { class: 'grow' }));
      kids.push(S.scanning
        ? h('button', { class: 'btn', onclick: cancelScan }, '검사 중단')
        : h('button', { class: 'btn' + (r ? '' : ' primary'), id: 'scanBtn', onclick: startScan }, icon(I.search), r ? '다시 검사' : '검사 시작'));
    } else if (S.view === 'dups') {
      kids.push(h('h1', {}, '중복 파일'));
      if (r && r.groups.length && !S.scanning) {
        kids.push(h('span', { class: 'sub num' }, `묶음 ${nf.format(r.groups.length)}개 · 최대 ${fmt(r.summary.dupWasted)}`), h('span', { class: 'grow' }),
          h('button', { class: 'btn', onclick: () => autoSelect('oldest') }, '가장 오래된 것만 남기기'),
          h('button', { class: 'btn', onclick: () => autoSelect('newest') }, '가장 최근 것만 남기기'),
          h('button', { class: 'btn plain', onclick: clearDupSelection }, '선택 해제'));
      }
    } else {
      kids.push(h('h1', {}, '정리 추천'));
      if (r && r.categories.length && !S.scanning) kids.push(h('span', { class: 'sub num' }, `${r.categories.length}가지 · 최대 ${fmt(r.summary.recoTotal)}`));
    }
    $('toolbar').replaceChildren(...kids);
  }

  // ---------- 그리기: 저장공간 ----------
  const CAT_LOOK = {
    dups: [I.copy, 'var(--accent)'], trash: [I.trash, 'var(--gray)'], installers: [I.down, 'var(--teal)'],
    caches: [I.bolt, 'var(--green)'], logs: [I.doc, 'var(--gray)'], dev: [I.wrench, 'var(--indigo)'],
    oldDownloads: [I.clock, 'var(--orange)'], iosBackups: [I.phone, 'var(--purple)'], large: [I.expand, 'var(--orange)'],
  };
  function tile(id) {
    const [ic, color] = CAT_LOOK[id] || [I.doc, 'var(--gray)'];
    return h('span', { class: 'tile', style: `background:${color}` }, icon(ic));
  }
  function tag(safety) {
    return h('span', { class: 'tag ' + safety }, safety === 'safe' ? '지워도 안전' : '확인 후 삭제');
  }
  function bigNum(text) {
    const m = text.match(/^([\d.]+)(\D+)$/) || [null, text, ''];
    return h('span', { class: 'free' }, m[1], h('small', {}, m[2]));
  }
  function viewHome() {
    const d = S.disk;
    const r = S.scanning ? null : S.result;
    const p = parts();
    const freePct = d.total ? d.free / d.total : 1;
    const out = [];

    const legend = h('div', { class: 'legend' },
      h('span', { class: 'k-used' }, h('i'), `사용 중 ${fmt(p.used)}`),
      p.dup > 0 && h('span', { class: 'k-dup' }, h('i'), `중복 파일 ${fmt(p.dup)}`),
      p.safe > 0 && h('span', { class: 'k-safe' }, h('i'), `지워도 안전 ${fmt(p.safe)}`),
      p.review > 0 && h('span', { class: 'k-review' }, h('i'), `확인 후 삭제 ${fmt(p.review)}`),
      h('span', {}, h('i'), `사용 가능 ${fmt(p.free)}`));
    const box = h('div', { class: 'box' },
      h('div', { class: 'storage' },
        h('div', { class: 'storage-head' },
          bigNum(fmt(d.free)),
          h('span', { class: 'freelabel' }, '사용 가능'),
          freePct < 0.1 && h('span', { class: 'tag low' }, '공간이 많이 부족해요'),
          freePct >= 0.1 && freePct < 0.2 && h('span', { class: 'tag review' }, '공간이 줄어들고 있어요'),
          h('span', { class: 'cap' }, `이 Mac · 전체 ${fmt(d.total)}`)),
        storageBar('sbar'), legend));
    if (S.scanning) box.append(h('div', { class: 'progress', id: 'progress' }));
    else if (r) {
      box.append(h('div', { class: 'gainline' },
        h('div', { class: 'text' },
          h('div', {}, '정리하면 최대 ', h('b', { class: 'num' }, fmt(p.gain)), '를 되찾을 수 있어요'),
          h('div', { class: 'd num' }, `파일 ${nf.format(r.summary.files)}개를 ${Math.max(1, Math.round(r.summary.elapsedMs / 1000))}초 동안 살펴봤어요.`))));
    } else {
      box.append(h('div', { class: 'gainline' },
        h('div', { class: 'text' },
          h('div', {}, h('b', {}, '무엇을 정리할 수 있는지 찾아볼게요')),
          h('div', { class: 'd' }, '검사만으로는 아무것도 지워지지 않아요. 결과를 보고 직접 고르면 돼요.')),
        h('button', { class: 'btn primary big', onclick: startScan }, '검사 시작')));
    }
    out.push(box);

    if (S.error) out.push(h('div', { class: 'banner' }, h('span', { class: 'grow' }, `검사 중 문제가 생겼어요: ${S.error}`), h('button', { class: 'btn small', onclick: startScan }, '다시 시도')));

    if (S.scanning) {
      out.push(h('div', { class: 'caption' }, '추천', h('span', { class: 'side' }, '찾는 중이에요')),
        h('div', { class: 'box' }, [0, 1, 2, 3].map(() => h('div', { class: 'skel' }, h('i'), h('i'), h('i')))));
    } else if (r) {
      const rows = [{ id: 'dups', title: '중복 파일', total: r.summary.dupWasted,
        desc: r.groups.length ? `똑같은 파일 ${nf.format(r.summary.dupFiles)}개를 지울 수 있어요` : '중복된 파일이 없어요', run: () => go('dups') }]
        .concat(r.categories.map((c) => ({ id: c.id, title: c.title, safety: c.safety, total: c.total, unknown: c.unknownSize, desc: c.desc, run: () => go('reco', c.id) })));
      out.push(h('div', { class: 'caption' }, '추천'),
        h('div', { class: 'box summary' }, rows.map((x) => h('button', { class: 'cell tiled', onclick: x.run },
          tile(x.id),
          h('div', { class: 'text' }, h('div', { class: 't' }, x.title, x.safety && tag(x.safety)), h('div', { class: 'd' }, x.desc)),
          h('span', { class: 'v' }, x.unknown ? '확인 불가' : fmt(x.total)),
          icon(I.chev, 'chev')))));
      if (r.summary.denied.length) {
        out.push(h('div', { class: 'banner' },
          h('span', { class: 'grow' }, `폴더 ${nf.format(r.summary.denied.length)}곳은 권한이 없어 건너뛰었어요. 더 꼼꼼히 찾으려면 '전체 디스크 접근 권한'에서 말끔을 켜 주세요.`),
          h('button', { class: 'btn small', onclick: () => api.openPrivacySettings() }, '설정 열기…')));
      }
    }

    if (!S.scanning) {
      out.push(h('div', { class: 'caption' }, '검사 설정'),
        h('div', { class: 'box' },
          h('div', { class: 'cell' },
            h('div', { class: 'text' }, h('div', {}, '검사할 곳'),
              h('div', { class: 'd' }, S.roots.length ? S.roots.map((x) => split(x + '/x').dir).join(', ') : '홈 폴더 안의 문서, 다운로드, 바탕화면 등을 모두 살펴봐요')),
            h('div', { class: 'seg' },
              h('button', { 'aria-pressed': String(!S.roots.length), onclick: () => { S.roots = []; renderMain(); } }, '홈 폴더 전체'),
              h('button', { 'aria-pressed': String(!!S.roots.length), onclick: pickFolders }, '폴더 선택…'))),
          h('div', { class: 'cell' },
            h('div', { class: 'text' }, h('div', {}, '중복으로 볼 최소 크기'), h('div', { class: 'd' }, '이보다 작은 파일은 중복이어도 무시해요')),
            h('div', { class: 'seg' }, [[100e3, '100KB'], [1e6, '1MB'], [10e6, '10MB']].map(([v, l]) =>
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
      sub = p.current || '';
    } else if (p.phase === 'hash') {
      title = '똑같은 파일인지 비교하고 있어요';
      if (p.total) pct = p.step === 'quick' ? (p.done / p.total) * 0.15 : 0.15 + (p.done / p.total) * 0.85;
      sub = p.step === 'full' ? `${fmt(p.done)} / ${fmt(p.total)}` : '';
    } else {
      title = '정리할 만한 항목을 찾고 있어요';
      sub = p.label || '';
    }
    el.replaceChildren(
      h('div', { class: 't num' }, `${title} (${idx + 1}/3단계)`),
      h('div', { class: 'sub num' }, '‎' + sub),
      h('div', { class: 'bar' + (pct == null ? ' indet' : '') }, h('i', { style: pct == null ? '' : `transform:scaleX(${Math.min(1, pct)})` })));
  }

  // ---------- 그리기: 빈 화면 · 파일 줄 ----------
  function emptyState(ic, title, body, withScan) {
    return h('div', { class: 'empty' }, h('div', { class: 'orb' }, icon(ic)), h('h2', {}, title), h('p', {}, body),
      withScan && h('button', { class: 'btn primary', onclick: startScan }, '검사 시작'));
  }
  function fileRow(item, { keepBadge, onToggle } = {}) {
    const { dir, name } = split(item.path);
    const on = S.selected.has(item.path);
    return h('label', { class: 'row' + (on ? ' picked' : '') },
      h('input', { type: 'checkbox', checked: on, 'aria-label': `${name} 선택`, onchange: (e) => onToggle(e.target.checked, e.target) }),
      h('div', { class: 'file' }, h('div', { class: 'name', title: item.path }, item.name || name), h('div', { class: 'dir' }, dir)),
      keepBadge && !on && h('span', { class: 'keep' }, '남김'),
      h('button', { class: 'btn small reveal', onclick: (e) => { e.preventDefault(); api.reveal(item.path); } }, 'Finder에서 보기'),
      h('span', { class: 'date' }, fmtDate(item.mtimeMs)),
      h('span', { class: 'size' }, fmt(item.size)));
  }

  // ---------- 그리기: 중복 파일 ----------
  function viewDups() {
    if (S.scanning) return [emptyState(I.search, '검사하는 중이에요', '끝나면 여기에 결과가 나타나요.')];
    if (!S.result) return [emptyState(I.copy, '아직 검사하지 않았어요', '검사를 하면 내용이 완전히 같은 파일을 찾아드려요.', true)];
    const groups = S.result.groups;
    if (!groups.length) return [emptyState(I.check, '중복된 파일이 없어요', '똑같은 파일을 찾지 못했어요.')];

    const out = [h('p', { class: 'foot', style: 'margin:0 0 14px' }, '내용이 한 글자도 다르지 않은 파일끼리 묶었어요. 묶음마다 하나는 꼭 남겨요.')];
    for (const g of groups.slice(0, S.dupShown)) {
      const picked = g.files.filter((f) => S.selected.has(f.path)).length;
      out.push(h('div', { class: 'box group' },
        h('div', { class: 'group-head' },
          h('span', { class: 'title' }, split(g.files[0].path).name),
          h('span', { class: 'sub num' }, `${g.files.length}개 · 각 ${fmt(g.size)}`),
          h('span', { class: 'save' + (picked ? ' on' : '') }, picked ? `${fmt(picked * g.size)} 선택됨` : `${fmt(g.wasted)} 절약 가능`)),
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
        }))));
    }
    if (groups.length > S.dupShown) {
      out.push(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => { S.dupShown += 60; renderMain(); } }, `묶음 ${nf.format(groups.length - S.dupShown)}개 더 보기`)));
    }
    return out;
  }

  // ---------- 그리기: 정리 추천 ----------
  function viewReco() {
    if (S.scanning) return [emptyState(I.search, '검사하는 중이에요', '끝나면 여기에 결과가 나타나요.')];
    if (!S.result) return [emptyState(I.spark, '아직 검사하지 않았어요', '검사를 하면 지워도 되는 파일을 추천해 드려요.', true)];
    const cats = S.result.categories;
    if (!cats.length) return [emptyState(I.check, '추천할 항목이 없어요', '정리할 만한 파일을 찾지 못했어요.')];

    const out = [h('p', { class: 'foot', style: 'margin:0 0 14px' }, '지워도 괜찮은 것부터 순서대로 보여드려요. 원하는 것만 골라서 정리하세요.')];
    for (const c of cats) {
      const open = S.openCats.has(c.id);
      const picked = c.items.filter((i) => S.selected.has(i.path));
      const card = h('div', { class: 'box cat' + (open ? ' open' : '') },
        h('button', { class: 'cell cat-head', 'aria-expanded': String(open), onclick: () => { open ? S.openCats.delete(c.id) : S.openCats.add(c.id); renderMain(); } },
          tile(c.id),
          h('div', { class: 'text' }, h('div', { class: 't' }, c.title, tag(c.safety)), h('div', { class: 'd' }, c.desc)),
          h('span', { class: 'v' }, c.unknownSize ? '확인 불가' : fmt(c.total)),
          icon(I.chev, 'chev')));
      if (open) {
        const body = h('div', { class: 'cat-body' });
        if (c.action === 'emptyTrash') {
          body.append(h('div', { class: 'cat-actions' },
            h('button', { class: 'btn', onclick: emptyTrash }, '휴지통 비우기…'),
            h('button', { class: 'btn', onclick: () => api.openTrash() }, 'Finder에서 휴지통 열기')));
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
            body.append(h('div', { class: 'cat-more' }, h('button', { class: 'btn small', onclick: () => { S.catShown[c.id] = shown + 100; renderMain(); } }, `${nf.format(c.items.length - shown)}개 더 보기`)));
          }
        }
        card.append(body);
      }
      out.push(card);
    }
    return out;
  }

  // ---------- 그리기: 전체 ----------
  function renderMain() {
    const main = $('main');
    const top = main.scrollTop;
    const kids = S.view === 'dups' ? viewDups() : S.view === 'reco' ? viewReco() : viewHome();
    main.replaceChildren(h('div', { class: 'wrap' + (S.animate ? ' fresh' : '') }, kids));
    S.animate = false;
    main.scrollTop = top;
    renderToolbar();
    renderProgress();
  }
  function renderBar() {
    const bar = $('actionbar');
    const n = S.selected.size;
    bar.hidden = n === 0;
    if (!n) return;
    bar.replaceChildren(
      h('div', { class: 'info num' }, h('b', {}, `${nf.format(n)}개 항목 선택됨`), h('span', {}, `${fmt(selTotal())} 정리 예정`)),
      h('button', { class: 'btn plain', disabled: S.busy, onclick: () => { S.selected.clear(); render(); } }, '선택 해제'),
      h('button', { class: 'btn primary', id: 'trashBtn', disabled: S.busy, onclick: trashSelected }, S.busy ? '옮기는 중…' : '휴지통으로 이동'));
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
  if (api.onMenuScan) api.onMenuScan(() => { if (!S.scanning && !S.busy) startScan(); });
  render();
  refreshDisk();
})();
