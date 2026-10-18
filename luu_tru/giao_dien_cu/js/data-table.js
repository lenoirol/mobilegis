/* "Bảng số liệu": a clear detail table plus a summary table ("Bảng tổng") for experts.
   Self-contained: it fetches /api/research/observations itself and never fills missing values
   (empty = no data, never 0). Low-sample rows keep their numbers and are flagged. */
(() => {
  const INDICES = [
    {key: 'lst', label: 'LST', unit: '°C', name: 'Nhiệt độ bề mặt', digits: 1},
    {key: 'ndvi', label: 'NDVI', unit: '', name: 'Chỉ số thực vật', digits: 2},
    {key: 'tvdi', label: 'TVDI', unit: '', name: 'Độ khô hạn (thử nghiệm)', digits: 2},
  ];
  const SOURCES = [
    ['gee_recovery', 'GEE đã bổ sung 2025 (mặc định)'],
    ['gee', 'GEE bản gốc (đối chiếu)'],
    ['legacy', 'Bộ xử lý cũ (đối chiếu)'],
  ];
  const ENOUGH = 0.5, LOW = 0.1, PAGE = 25;
  const S = {view: 'detail', mode: 'real', source: 'gee_recovery', year: '2025', q: '', onlyEnough: false,
             sort: {key: 'name', dir: 1}, page: 0, minCov: 0.5, index: 'lst', cache: {}};

  const el = (tag, attrs = {}, ...kids) => { const n = Object.assign(document.createElement(tag), attrs); n.append(...kids); return n; };
  const fmt = (v, d) => v == null ? '' : Number(v).toLocaleString('vi-VN', {minimumFractionDigits: d, maximumFractionDigits: d});
  const pct = v => v == null ? '' : Math.round(v * 100).toLocaleString('vi-VN') + '%';
  const dmy = iso => iso.split('-').reverse().join('/');
  const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

  // ---- data ---------------------------------------------------------------------
  async function load() {
    const key = S.mode === 'real' ? 'real:' + S.source : S.mode;
    if (!S.cache[key]) {
      const url = S.mode === 'real' ? '/api/research/observations?source=' + S.source
        : S.mode === 'user' ? '/data/observations_user.json' : '/api/observations';
      const response = await fetch(url, {credentials: 'same-origin'});
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Không tải được số liệu.');
      S.cache[key] = await response.json();
    }
    return S.cache[key];
  }
  const quality = (row, k) => {
    const c = row[k + '_coverage'];
    if (row[k] == null) return 'missing';
    if (c == null) return 'unknown';
    return c >= ENOUGH ? 'ok' : c >= LOW ? 'low' : 'sparse';
  };
  const minCoverage = row => Math.min(...INDICES.map(i => row[i.key + '_coverage'] ?? 0));
  const rowDates = row => (row.dates || []).slice().sort();

  function filtered(rows) {
    const q = normalize(S.q);
    let out = rows.filter(r => (S.year === 'all' || String(r.year) === S.year)
      && (!q || normalize(r.name).includes(q) || String(r.code || '').includes(q))
      && (S.mode !== 'real' || !S.onlyEnough || INDICES.every(i => quality(r, i.key) === 'ok')));
    const {key, dir} = S.sort;
    const val = r => key === 'name' ? normalize(r.name) : key === 'coverage' ? minCoverage(r) : r[key];
    return out.sort((a, b) => { const x = val(a), y = val(b); return x == null ? 1 : y == null ? -1 : (x < y ? -dir : x > y ? dir : 0); });
  }

  // ---- detail table -------------------------------------------------------------
  const badge = (state, text) => el('span', {className: 'mg-badge mg-' + state}, text);
  function coverageCell(row) {
    const states = INDICES.map(i => quality(row, i.key));
    const worst = states.includes('missing') ? 'missing' : states.includes('sparse') ? 'sparse' : states.includes('low') ? 'low' : states.includes('unknown') ? 'unknown' : 'ok';
    const label = {ok: 'Đủ mẫu', low: 'Ít mẫu', sparse: 'Rất ít mẫu', missing: 'Thiếu', unknown: 'Không rõ'}[worst];
    const td = el('td', {className: 'mg-cov'}, badge(worst, label));
    if (row.lst_coverage != null) td.append(el('small', {}, INDICES.map(i => pct(row[i.key + '_coverage'])).join(' · ')));
    return td;
  }
  function valueCell(row, i) {
    const q = quality(row, i.key), td = el('td', {className: 'mg-num' + (q === 'ok' ? '' : ' mg-flag-' + q)}, q === 'missing' ? '—' : fmt(row[i.key], i.digits));
    if (q === 'low' || q === 'sparse') td.title = 'Ít pixel hợp lệ (' + pct(row[i.key + '_coverage']) + '); số có thật nhưng chưa đại diện cho cả khu vực.';
    return td;
  }
  function headerRow(columns) {
    const tr = el('tr');
    for (const c of columns) {
      const th = el('th', {scope: 'col', className: c.num ? 'mg-num' : ''});
      if (c.sort) {
        const b = el('button', {type: 'button', className: 'mg-sort'}, c.label + (S.sort.key === c.sort ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''));
        th.ariaSort = S.sort.key === c.sort ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none';
        b.onclick = () => { S.sort = {key: c.sort, dir: S.sort.key === c.sort ? -S.sort.dir : 1}; S.page = 0; render(); };
        th.append(b);
      } else th.textContent = c.label;
      if (c.hint) th.title = c.hint;
      tr.append(th);
    }
    return tr;
  }

  function detailTable(rows) {
    const real = S.mode === 'real';
    const columns = real
      ? [{label: 'Khu vực', sort: 'name'}, {label: 'Năm', sort: 'year', num: 1},
         ...INDICES.map(i => ({label: i.label + (i.unit ? ' ' + i.unit : '') + (i.key === 'tvdi' ? ' *' : ''), sort: i.key, num: 1, hint: i.name})),
         {label: 'Độ phủ mẫu', sort: 'coverage', hint: 'Tỷ lệ pixel hợp lệ của LST / NDVI / TVDI'}, {label: 'Ngày ảnh'}]
      : [{label: 'Khu vực', sort: 'name'}, {label: 'Năm', sort: 'year', num: 1}, ...INDICES.map(i => ({label: i.label, sort: i.key, num: 1})), {label: 'Nguồn'}, ...(S.mode === 'demo' ? [{label: 'Thao tác'}] : [])];
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    const body = el('tbody');
    for (const r of rows.slice(S.page * PAGE, S.page * PAGE + PAGE)) {
      const tr = el('tr');
      tr.append(el('th', {scope: 'row', className: 'mg-name'}, r.name || '', real ? el('small', {}, 'Mã ' + r.code) : ''), el('td', {className: 'mg-num'}, String(r.year)));
      for (const i of INDICES) tr.append(real ? valueCell(r, i) : el('td', {className: 'mg-num'}, fmt(r[i.key], i.digits)));
      if (real) {
        tr.append(coverageCell(r));
        const d = rowDates(r);
        tr.append(el('td', {className: 'mg-dates'}, d.length ? (d[0] === d.at(-1) ? dmy(d[0]) : dmy(d[0]) + ' – ' + dmy(d.at(-1))) : '', d.length ? el('small', {}, (r.scene_ids || d).length + ' cảnh') : ''));
      } else {
        tr.append(el('td', {className: 'mg-src'}, r.source || ''));
        if (S.mode === 'demo') {
          const td = el('td', {className: 'mg-actions admin-only'});
          const edit = el('button', {type: 'button'}, 'Sửa'), del = el('button', {type: 'button'}, 'Xóa');
          edit.onclick = () => window.editor && window.editor(r);
          del.onclick = async () => { if (!confirm('Xóa điểm "' + r.name + '"?')) return; try { await MG.api('/api/delete', {id: r.id}, MG.token); delete S.cache.demo; if (window.refreshDemo) await window.refreshDemo(); else await render(); } catch (e) { alert(e.message); } };
          td.append(edit, del); tr.append(td);
        }
      }
      body.append(tr);
    }
    if (!rows.length) body.append(el('tr', {}, el('td', {colSpan: columns.length, className: 'mg-empty'}, 'Không có dòng nào khớp bộ lọc.')));
    const table = el('table', {className: 'mg-table'}, el('caption', {className: 'sr-only'}, 'Bảng số liệu LST, NDVI và TVDI'), el('thead', {}, headerRow(columns)), body);
    const pager = el('div', {className: 'mg-pager'});
    const prev = el('button', {type: 'button', disabled: S.page === 0}, '‹ Trước'), next = el('button', {type: 'button', disabled: S.page >= pages - 1}, 'Sau ›');
    prev.onclick = () => { S.page--; render(); }; next.onclick = () => { S.page++; render(); };
    pager.append(prev, el('span', {}, `Trang ${S.page + 1}/${pages} · ${rows.length.toLocaleString('vi-VN')} dòng`), next);
    return el('div', {}, el('div', {className: 'mg-scroll'}, table), pager);
  }

  // ---- summary table (expert overview) ------------------------------------------
  function summarize(rows, i, year) {
    const have = rows.filter(r => r.year === year && r[i.key] != null);
    const used = have.filter(r => (r[i.key + '_coverage'] ?? 0) >= S.minCov);
    const values = used.map(r => r[i.key]);
    const weights = used.reduce((s, r) => s + (r[i.key + '_pixels'] || 0), 0);
    const weighted = weights ? used.reduce((s, r) => s + r[i.key] * (r[i.key + '_pixels'] || 0), 0) / weights : null;
    const sorted = [...used].sort((a, b) => a[i.key] - b[i.key]);
    return {have: have.length, used: used.length, weighted, median: median(values), min: sorted[0], max: sorted.at(-1),
            mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, pixels: weights};
  }
  function summaryTables(rows) {
    const years = [...new Set(rows.map(r => r.year))].sort();
    const units = new Set(rows.map(r => r.code)).size;
    const wrap = el('div', {className: 'mg-summary'});
    const table = el('table', {className: 'mg-table mg-sum'}, el('caption', {}, `Tổng quan theo năm · ${units} khu vực · tính trên khu vực có độ phủ mẫu ≥ ${Math.round(S.minCov * 100)}%`));
    table.append(el('thead', {}, headerRow([{label: 'Chỉ số'}, {label: 'Năm', num: 1}, {label: 'Khu vực đủ mẫu', num: 1, hint: 'Số khu vực có số liệu / đạt ngưỡng độ phủ'},
      {label: 'TB toàn vùng', num: 1, hint: 'Trung bình có trọng số theo số pixel hợp lệ của từng khu vực'}, {label: 'TB các khu vực', num: 1, hint: 'Trung bình cộng của trung bình từng khu vực'},
      {label: 'Trung vị', num: 1}, {label: 'Thấp nhất'}, {label: 'Cao nhất'}])));
    const body = el('tbody');
    for (const i of INDICES) {
      years.forEach((year, n) => {
        const s = summarize(rows, i, year), tr = el('tr', {className: n === 0 ? 'mg-group-start' : ''});
        if (n === 0) tr.append(el('th', {scope: 'rowgroup', rowSpan: years.length, className: 'mg-index mg-index-' + i.key}, i.label, el('small', {}, i.name + (i.unit ? ' (' + i.unit + ')' : ''))));
        const ext = r => r ? el('td', {}, fmt(r[i.key], i.digits) + ' ', el('small', {}, r.name)) : el('td', {}, '');
        tr.append(el('td', {className: 'mg-num'}, String(year)), el('td', {className: 'mg-num'}, `${s.used}/${s.have}`),
          el('td', {className: 'mg-num mg-strong'}, fmt(s.weighted, i.digits)), el('td', {className: 'mg-num'}, fmt(s.mean, i.digits)),
          el('td', {className: 'mg-num'}, fmt(s.median, i.digits)), ext(s.min), ext(s.max));
        body.append(tr);
      });
    }
    table.append(body);
    wrap.append(el('div', {className: 'mg-scroll'}, table));
    // Top / bottom 10 for the selected index and year
    const year = S.year === 'all' ? years.at(-1) : Number(S.year), idx = INDICES.find(i => i.key === S.index);
    const eligible = rows.filter(r => r.year === year && r[idx.key] != null && (r[idx.key + '_coverage'] ?? 0) >= S.minCov).sort((a, b) => b[idx.key] - a[idx.key]);
    const rank = (title, list) => {
      const t = el('table', {className: 'mg-table mg-rank'}, el('caption', {}, title), el('thead', {}, headerRow([{label: '#', num: 1}, {label: 'Khu vực'}, {label: idx.label, num: 1}, {label: 'Độ phủ', num: 1}])));
      const b = el('tbody');
      list.forEach((r, n) => b.append(el('tr', {}, el('td', {className: 'mg-num'}, String(n + 1)), el('th', {scope: 'row', className: 'mg-name'}, r.name, el('small', {}, 'Mã ' + r.code)), el('td', {className: 'mg-num mg-strong'}, fmt(r[idx.key], idx.digits)), el('td', {className: 'mg-num'}, pct(r[idx.key + '_coverage'])))));
      t.append(b); return el('div', {className: 'mg-scroll'}, t);
    };
    const pick = el('div', {className: 'mg-rank-head'}, el('h3', {}, `Xếp hạng khu vực · ${idx.label} · năm ${year}`));
    wrap.append(pick, el('div', {className: 'mg-rank-grid'}, rank('10 khu vực cao nhất', eligible.slice(0, 10)), rank('10 khu vực thấp nhất', eligible.slice(-10).reverse())));
    wrap.append(el('p', {className: 'mg-note'}, 'Lưu ý: "TB toàn vùng" là trung bình theo pixel hợp lệ của các khu vực đủ mẫu, không phải trung bình khí hậu năm. Số liệu là mùa khô theo ngày ảnh từng khu vực; TVDI là chỉ số thử nghiệm; chênh lệch giữa các năm chưa là xu thế đã kiểm định.'));
    return wrap;
  }

  // ---- shell --------------------------------------------------------------------
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], {type: 'text/csv;charset=utf-8'}));
    const a = el('a', {href: url, download: name}); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  const csvCell = v => { v = Array.isArray(v) ? v.join(' ') : v ?? ''; return /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v; };

  function controls(rows) {
    const box = el('div', {className: 'mg-controls'});
    const field = (label, node) => el('label', {className: 'mg-field'}, el('span', {}, label), node);
    const search = el('input', {type: 'search', placeholder: 'Tên hoặc mã khu vực…', value: S.q});
    search.oninput = () => { S.q = search.value; S.page = 0; clearTimeout(search.t); search.t = setTimeout(render, 150); };
    const year = el('select', {}, el('option', {value: 'all'}, 'Tất cả năm'), ...[2020, 2021, 2022, 2023, 2024, 2025].map(y => el('option', {value: y}, 'Năm ' + y)));
    year.value = S.year; year.onchange = () => { S.year = year.value; S.page = 0; render(); };
    const mode = el('div', {className: 'mg-seg', role: 'group', ariaLabel: 'Bộ dữ liệu'});
    for (const [k, label] of [['real', 'Landsat · 167 khu vực'], ['user', 'CSV nhóm · 4 điểm'], ['demo', 'Điểm thực hành']]) {
      const b = el('button', {type: 'button', className: S.mode === k ? 'active' : ''}, label);
      b.onclick = () => setMode(k); mode.append(b);
    }
    box.append(mode, field('Tìm khu vực', search), field('Năm', year));
    if (S.mode === 'real' && S.view === 'summary') {
      const idx = el('select', {}, ...INDICES.map(i => el('option', {value: i.key}, i.label + ' · ' + i.name)));
      idx.value = S.index; idx.onchange = () => { S.index = idx.value; render(); };
      const cov = el('select', {}, ...[[0.1, '≥ 10%'], [0.5, '≥ 50% (khuyến nghị)'], [0.8, '≥ 80%']].map(([v, l]) => el('option', {value: v}, l)));
      cov.value = S.minCov; cov.onchange = () => { S.minCov = Number(cov.value); render(); };
      box.append(field('Xếp hạng theo', idx), field('Ngưỡng độ phủ mẫu', cov));
    } else if (S.mode === 'real') {
      const only = el('input', {type: 'checkbox', checked: S.onlyEnough});
      only.onchange = () => { S.onlyEnough = only.checked; S.page = 0; render(); };
      box.append(el('label', {className: 'mg-check'}, only, ' Chỉ khu vực đủ mẫu (≥ 50% cả 3 chỉ số)'));
    }
    return box;
  }

  function actions(rows, shown) {
    const bar = el('div', {className: 'mg-actions-bar'});
    const exportShown = el('button', {type: 'button', className: 'primary'}, '↓ Xuất bảng đang hiển thị (CSV)');
    exportShown.onclick = () => {
      const head = S.mode === 'real' ? ['ma', 'khu_vuc', 'nam', 'lst_c', 'ndvi', 'tvdi', 'do_phu_lst', 'do_phu_ndvi', 'do_phu_tvdi', 'ngay_anh'] : ['khu_vuc', 'nam', 'lst', 'ndvi', 'tvdi', 'nguon'];
      const lines = shown.map(r => (S.mode === 'real' ? [r.code, r.name, r.year, r.lst, r.ndvi, r.tvdi, r.lst_coverage, r.ndvi_coverage, r.tvdi_coverage, rowDates(r)] : [r.name, r.year, r.lst, r.ndvi, r.tvdi, r.source]).map(csvCell).join(','));
      download('mobilegis_bang_so_lieu.csv', [head.join(','), ...lines].join('\n'));
    };
    bar.append(exportShown);
    // Admin tools keep their original handlers: move the existing buttons here instead of rewriting them.
    for (const id of ['add', 'importLabel']) { const node = document.getElementById(id); if (node) { node.classList.add('admin-only'); bar.append(node); } }
    return bar;
  }

  async function setMode(mode) {
    S.mode = mode; S.page = 0; S.sort = {key: 'name', dir: 1};
    const legacy = document.getElementById('tableDataset');   // keep legacy state (map, admin buttons) in sync
    if (legacy && legacy.value !== mode) { legacy.value = mode; legacy.dispatchEvent(new Event('change')); }
    render();
  }

  let root, busy = 0;
  async function render() {
    const ticket = ++busy;
    root.querySelector('.mg-body')?.classList.add('loading');
    let rows;
    try { rows = await load(); } catch (e) { root.querySelector('.mg-body').replaceChildren(el('p', {className: 'mg-error', role: 'alert'}, e.message)); return; }
    if (ticket !== busy) return;
    const shown = filtered(rows);
    const tabs = el('div', {className: 'mg-tabs', role: 'tablist'});
    for (const [k, label] of [['detail', 'Bảng chi tiết'], ['summary', 'Bảng tổng · cho chuyên gia']]) {
      if (k === 'summary' && S.mode !== 'real') continue;
      const b = el('button', {type: 'button', role: 'tab', ariaSelected: String(S.view === k), className: S.view === k ? 'active' : ''}, label);
      b.onclick = () => { S.view = k; render(); }; tabs.append(b);
    }
    if (S.mode !== 'real') S.view = 'detail';
    const body = el('div', {className: 'mg-body'});
    body.append(tabs, controls(rows));
    if (S.mode === 'real') {
      const src = el('select', {className: 'mg-source'}, ...SOURCES.map(([v, l]) => el('option', {value: v}, l)));
      src.value = S.source; src.onchange = () => { S.source = src.value; S.page = 0; render(); };
      body.append(el('details', {className: 'mg-adv'}, el('summary', {}, 'Nguồn dữ liệu (nâng cao)'), src));
    }
    const status = S.mode === 'real' ? 'Ô trống (—) nghĩa là không có số liệu, không phải 0. Ô nền vàng là khu vực ít pixel hợp lệ: số vẫn là số thật nhưng chưa đại diện cả khu vực. * TVDI là chỉ số thử nghiệm.'
      : S.mode === 'user' ? 'CSV nhóm cung cấp: 24 dòng tại 4 điểm, giữ nguyên số liệu; không phải trung bình xã/phường.' : 'Điểm thực hành do quản trị viên nhập; không phải số liệu nghiên cứu.';
    body.append(el('p', {className: 'mg-hint'}, status));
    if (S.view === 'summary' && S.mode === 'real') body.append(summaryTables(rows));
    else body.append(el('p', {className: 'mg-count'}, `${shown.length.toLocaleString('vi-VN')} dòng`), actions(rows, shown), detailTable(shown));
    root.querySelector('.mg-body').replaceWith(body);
    for (const id of ['add', 'importLabel']) { const n = document.getElementById(id); if (n && S.view === 'summary') n.hidden = true; }
  }

  function init() {
    const page = document.getElementById('dataView');
    if (!page || document.getElementById('mgData')) return;
    root = el('section', {id: 'mgData'}, el('div', {className: 'mg-head'}, el('span', {className: 'eyebrow'}, 'BẢNG SỐ LIỆU'), el('h1', {}, 'Số liệu LST · NDVI · TVDI theo xã/phường')), el('div', {className: 'mg-body'}));
    page.prepend(root);
    page.classList.add('mg-page');
    document.getElementById('dataTab')?.addEventListener('click', () => {
      if (typeof state !== 'undefined' && state.mode !== S.mode) S.mode = state.mode;  // map tab may have switched dataset
      render();
    });
    // Every older code path that refreshes the table (source change, demo save/import, tab switch) lands here.
    window.renderTable = () => { delete S.cache.demo; if (typeof state !== 'undefined') S.mode = state.mode; render(); };
    render();
  }
  (window.MG ? MG.ready : Promise.resolve()).then(() => (document.readyState === 'loading' ? new Promise(r => addEventListener('DOMContentLoaded', r)) : null)).then(init);
  window.MGDataTable = {render, state: S};
})();
