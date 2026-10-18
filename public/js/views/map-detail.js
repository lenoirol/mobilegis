/* Right-hand detail card: selected area, metrics with sample-quality tags, trend, provenance, land cover. */
import {h, icon, mount} from '../core/dom.js';
import {INDEX, INDICES, fmt, pct, valid, dmy} from '../core/format.js';
import {countTo} from '../core/motion.js';
import {lineChart, stackBar} from '../ui/charts.js';
import {url, env} from '../core/api.js';

const policy = window.ViewerPolicy;
const QUALITY_LABEL = {adequate: ['ok', 'Đủ mẫu'], limited: ['low', 'Ít mẫu'], unknown: ['low', 'Chưa rõ'], missing: ['missing', 'Thiếu']};
const QUALITY_TEXT = {
  missing: 'Chưa có giá trị hợp lệ ở mốc này. Vùng trống không phải 0.',
  unknown: 'Chưa xác định được độ phủ nên chưa nên so sánh với khu vực khác.',
};

export function rasterLink(source, state) {
  const {index, year} = state;
  if (state.landcover) return source === 'legacy' ? '/api/rasters/worldcover_2021_120m.tif' : '/api/gee/rasters/worldcover_2021_10m.tif';
  if (state.display === 'change') return source === 'legacy' ? `/api/rasters/change_${index}_2020_2025_120m.tif` : `/api/${source}/rasters/change_${index}_2020_2025_120m.tif`;
  if (source === 'legacy') return `/api/rasters/${index}_${year}_120m.tif`;
  return source === 'gee_recovery' && year === 2025 ? '/api/gee_recovery/rasters/indices_2025_recovery_batch1_120m.tif' : `/api/gee/rasters/indices_${year}_120m.tif`;
}

export function createDetail({onPin, onTable, onClose}) {
  const tiles = INDICES.map(key => ({key, value: h('b', {class: 'mono num'}, '—'), unit: h('small', null), tag: h('span', {class: 'tag missing'}, 'Thiếu'), root: null}));
  tiles.forEach(t => {
    t.root = h('div', {class: 'metric', dataset: {index: t.key}}, h('small', {class: 'mono'}, INDEX[t.key].label + (INDEX[t.key].experimental ? ' *' : '')), t.value, t.unit, t.tag);
  });
  const name = h('h2', {class: 'detail-name'}, 'Chạm vào một xã/phường');
  const sub = h('p', {class: 'detail-sub mono'});
  const note = h('div', {class: 'callout'});
  const probe = h('div', {class: 'probe', hidden: true});
  const chartHost = h('div', {class: 'detail-chart'});
  const chartTitle = h('h3', {class: 'dock-title'}, 'Diễn biến theo mốc ảnh');
  const chartNote = h('p', {class: 'dock-help'}, 'Chỉ vẽ mốc có độ phủ ≥ 50%; không nối qua khoảng thiếu.');
  const provenance = h('details', {class: 'prov'}, h('summary', null, 'Nguồn và ngày ảnh'), h('div', {class: 'prov-body'}));
  const cover = h('div', {class: 'cover', hidden: true});
  const download = h('a', {class: 'btn sm', href: '#', download: ''}, icon('download', 16), h('span', null, 'Tải GeoTIFF'));
  const pinBtn = h('button', {class: 'btn sm', type: 'button', on: {click: () => onPin()}}, icon('plus', 16), 'So sánh');
  const tableBtn = h('button', {class: 'btn sm', type: 'button', on: {click: () => onTable()}}, icon('table', 16), 'Bảng số liệu');
  const closeBtn = h('button', {class: 'icon-btn close-btn', type: 'button', 'aria-label': 'Thu gọn thông tin khu vực', on: {click: () => onClose()}}, icon('chevron', 18));
  let chart = null;

  const el = h('div', {class: 'detail-inner'},
    h('div', {class: 'detail-head'}, h('div', null, h('span', {class: 'eyebrow'}, 'Thông tin khu vực'), name, sub), closeBtn),
    h('div', {class: 'metrics'}, ...tiles.map(t => t.root)), note, probe, chartTitle, chartHost, chartNote, cover, provenance,
    h('div', {class: 'detail-actions'}, pinBtn, tableBtn, download));

  return {
    el,
    render(state, D, probeData, opts = {}) {
      const real = state.mode === 'real', idx = INDEX[state.index];
      el.classList.toggle('is-empty', !state.selected);
      if (!real) return renderPoint(state, D);
      const feature = D.geo?.features.find(f => f.id === state.selected);
      const row = D.rows?.get(state.selected, state.year);
      name.textContent = feature?.properties.full_name || 'Chạm vào một xã/phường';
      sub.textContent = feature ? `Mã ${feature.id} · ${fmt(feature.properties.area_km2_source, 2)} km² (nguồn)` : 'Chọn trên bản đồ hoặc tìm theo tên';
      tiles.forEach(t => {
        const q = policy.quality(row, t.key), [cls, text] = QUALITY_LABEL[q];
        t.root.classList.toggle('active', t.key === state.index);
        countTo(t.value, row?.[t.key], v => fmt(v, INDEX[t.key].digits), 600);
        if (!valid(row?.[t.key])) t.value.textContent = '—';
        t.unit.textContent = INDEX[t.key].unit;
        t.tag.className = 'tag ' + cls; t.tag.textContent = text; t.root.classList.toggle('flag', q !== 'adequate');
      });
      const q = policy.quality(row, state.index), cov = row?.[state.index + '_coverage'];
      note.className = 'callout' + (q === 'adequate' ? '' : ' warn');
      note.textContent = !feature ? 'Chọn một khu vực để xem số liệu, độ phủ và ngày ảnh.'
        : q === 'adequate' ? `Độ phủ ${pct(cov, 1)} · ${row[state.index + '_pixels']?.toLocaleString('vi-VN')} / ${row.sampled_pixels?.toLocaleString('vi-VN')} ô hợp lệ. Trung bình phần có mẫu, không phải toàn bộ khu vực hay độ chính xác.`
        : q === 'limited' ? `Ít mẫu: độ phủ ${pct(cov, 1)}. Giá trị chỉ mô tả phần có mẫu, chưa đại diện cả phường; không dùng để xếp hạng mặc định.` : QUALITY_TEXT[q];
      if (state.display === 'change' && feature) {
        const a = D.rows?.get(state.selected, 2020), b = row, delta = valid(a?.[state.index]) && valid(b?.[state.index]) ? b[state.index] - a[state.index] : null;
        note.textContent += ` Δ trung bình hai mốc: ${fmt(delta, idx.digits)} ${idx.unit}. Khác với Δ từng ô trên bản đồ.`;
      }
      // probe
      probe.hidden = !probeData;
      if (probeData) {
        mount(probe, h('b', {class: 'mono'}, `${probeData.lat.toFixed(4)}, ${probeData.lng.toFixed(4)}`),
          probeData.loading ? h('span', null, 'Đang tra cứu ô mẫu…') : probeData.error ? h('span', null, probeData.error)
          : h('span', null, valid(probeData.value) ? [h('b', {class: 'mono'}, `${fmt(probeData.value, idx.digits)} ${idx.unit}`.trim()), probeData.change ? ' (chênh lệch hai mốc)' : ''] : (probeData.unavailable ? 'chưa có bản xuất cho năm này' : 'thiếu dữ liệu tại ô này'), ' · ô gần nhất 120 m, khác trung bình xã/phường.'));
      }
      // trend
      chartTitle.textContent = `Diễn biến ${idx.label}`;
      const series = [{id: state.selected, name: feature?.properties.full_name || '', color: '#0e0e0c', points: (D.years || []).map(year => {
        const r = D.rows?.get(state.selected, year);
        return {x: year, y: policy.eligible(r, state.index) ? r[state.index] : null, lines: [`Độ phủ ${pct(r?.[state.index + '_coverage'], 1)}`]};
      })}];
      chart?.destroy();
      chart = lineChart(chartHost, series, {xs: D.years?.length ? D.years : [2020, 2025], compact: true, unit: idx.unit, label: `Diễn biến ${idx.name} của ${feature?.properties.full_name || 'khu vực'}`, minPad: state.index === 'lst' ? 1 : .03, yFormat: v => fmt(v, idx.digits), emptyText: 'Chưa có mốc đạt độ phủ 50%'});
      chartNote.hidden = !feature;
      // provenance
      const body = provenance.querySelector('.prov-body');
      mount(body, row ? [h('p', null, h('b', null, 'Ngày ảnh: '), (row.dates || []).map(dmy).join(', ') || 'không có'), h('p', {class: 'small'}, 'Các cảnh có thể khác ngày giữa khu vực và năm; kết quả là trung bình ô hợp lệ, không phải trung bình năm. LST là nhiệt độ bề mặt, không phải nhiệt độ không khí.'),
        row.recovery_pixels ? h('p', {class: 'small'}, `Bổ sung ${row.recovery_pixels} ô thực từ cảnh ${(row.recovery_dates || []).join(', ')}; các ô gốc giữ nguyên.`) : null]
        : h('p', {class: 'small'}, 'Chọn khu vực để xem ngày ảnh.'));
      // land cover
      const lc = D.cover?.find(c => c.code === state.selected);
      cover.hidden = !lc;
      if (lc) {
        const classes = [...lc.classes].filter(c => c.percent > 0).sort((a, b) => b.percent - a.percent);
        mount(cover, h('h3', {class: 'dock-title'}, 'Lớp phủ đất 2021 · mẫu ESA'), stackBar(classes), h('div', {class: 'cover-top'}, ...classes.slice(0, 3).map(c => h('span', null, h('i', {style: {background: c.color}}), `${c.name} ${fmt(c.percent, 1)}%`))),
          h('p', {class: 'dock-help'}, 'Tỷ lệ trong các ô mẫu có phân loại; không phải diện tích địa chính.'));
      }
      download.href = url(rasterLink(state.source, state)); download.hidden = !D.layers || !env.api;   // GeoTIFF files are served by the API
      download.querySelector('span').textContent = state.landcover ? 'Tải lớp phủ 2021' : state.display === 'change' ? 'Tải GeoTIFF chênh lệch' : 'Tải GeoTIFF ' + state.year;
      pinBtn.hidden = !feature; tableBtn.hidden = !feature;
      pinBtn.disabled = opts.pinned?.includes(state.selected);
      pinBtn.lastChild.textContent = opts.pinned?.includes(state.selected) ? 'Đã trong so sánh' : 'So sánh';
    },
  };

  function renderPoint(state, D) {
    const rows = (D.points || []).filter(p => p.name === state.selected).sort((a, b) => a.year - b.year);
    const row = rows.find(r => r.year === state.year);
    name.textContent = state.selected || (state.mode === 'user' ? 'Chọn điểm trong CSV' : 'Chọn điểm thực hành');
    sub.textContent = row ? `Tọa độ ${row.lat}, ${row.lon}${row.containing_units?.length ? ' · ' + row.containing_units.map(u => u.name).join(', ') : ''}` : '';
    tiles.forEach(t => { countTo(t.value, row?.[t.key], v => fmt(v, INDEX[t.key].digits), 600); if (!valid(row?.[t.key])) t.value.textContent = '—'; t.unit.textContent = INDEX[t.key].unit; t.tag.className = 'tag signal'; t.tag.textContent = state.mode === 'user' ? 'CSV' : 'Giả lập'; t.root.classList.toggle('active', t.key === state.index); t.root.classList.remove('flag'); });
    note.className = 'callout warn';
    note.textContent = state.mode === 'user' ? 'Giá trị tại tọa độ trong CSV nhóm cung cấp; chưa biết điểm đơn hay vùng đệm, không phải trung bình xã/phường. Chưa có mã cảnh/script GEE để tái kiểm chứng.' : 'Điểm thực hành do quản trị viên nhập, không phải số đo vệ tinh.';
    probe.hidden = true; cover.hidden = true;
    chart?.destroy();
    const idx = INDEX[state.index];
    chart = lineChart(chartHost, [{id: state.selected, name: state.selected || '', color: '#0e0e0c', points: (D.years?.length ? D.years : [2020, 2021, 2022, 2023, 2024, 2025]).map(year => ({x: year, y: rows.find(r => r.year === year)?.[state.index] ?? null}))}],
      {compact: true, unit: idx.unit, label: 'Diễn biến theo năm', yFormat: v => fmt(v, idx.digits), minPad: state.index === 'lst' ? 1 : .03});
    mount(provenance.querySelector('.prov-body'), h('p', null, row ? `${row.year} · ${row.source || ''}` : 'Không có dữ liệu ở năm này.'));
    download.hidden = true; pinBtn.hidden = true; tableBtn.hidden = true;
  }
}
