/* Floating widgets on the map: selected-area card, legend and the year timeline (with range + playback). */
import {h, mount, svg, icon} from '../core/dom.js';
import {infoButton, showGlossary} from '../ui/glossary.js';
import {INDEX, INDICES, YEARS, indexTitle, fmt, colorOf, rampCss, confidence, tvdiClass, TVDI_ALERT, dmy, valid} from '../core/format.js';

const policy = window.ViewerPolicy;

// ---------- selected area ----------
function spark(series, k) {
  const W = 120, H = 30, r = INDEX[k], pts = series.map((row, i) => ({x: 4 + i * (W - 8) / (YEARS.length - 1), v: policy.eligible(row, k) ? row[k] : null}));
  const vals = pts.filter(p => p.v != null).map(p => p.v);
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), y = v => H - 5 - (hi === lo ? .5 : (v - lo) / (hi - lo)) * (H - 10);
  const node = svg('svg', {class: 'spark', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${r.code} 2020–2025`});
  let seg = [];
  const flush = () => { if (seg.length > 1) node.append(svg('polyline', {points: seg.map(p => `${p.x},${y(p.v)}`).join(' '), fill: 'none', stroke: '#435162', 'stroke-width': 1.6})); seg = []; };
  pts.forEach(p => { if (p.v == null) flush(); else seg.push(p); });   // gaps stay gaps: never bridge a missing year
  flush();
  pts.forEach(p => p.v != null && node.append(svg('circle', {cx: p.x, cy: y(p.v), r: 2.4, fill: colorOf(p.v, k), stroke: '#435162', 'stroke-width': .8})));
  return node;
}

export function renderInfo(host, {code, geo, rows, store}) {
  if (!code) { mount(host); return; }
  const s = store.get(), f = geo.features.find(x => x.properties.code === code);
  if (!f) { mount(host); return; }
  const row = rows.get(code, s.year), series = YEARS.map(y => rows.get(code, y));
  const vals = INDICES.map(k => {
    const spec = INDEX[k], ok = policy.eligible(row, k), conf = confidence(row?.[`${k}_coverage`]);
    return h('button', {class: 'val', type: 'button', 'aria-pressed': String(k === s.index), title: spec.help, on: {click: () => store.set({index: k})}},
      h('small', null, `${spec.code}${spec.experimental ? '*' : ''} · ${spec.label}`),
      h('b', null, ok ? [h('em', {style: {background: colorOf(row[k], k)}}), fmt(row[k], spec.digits)] : '—'),
      h('span', {class: 'q ' + conf.key}, ok ? `Tin cậy ${conf.text.toLowerCase()}` : (valid(row?.[k]) ? 'Chưa đủ dữ liệu' : 'Không có dữ liệu')));
  });
  const tv = policy.eligible(row, 'tvdi') ? row.tvdi : null;
  const ds = [...(row?.dates || [])].sort(), dates = ds.length ? (ds.length === 1 ? dmy(ds[0]) : `${dmy(ds[0]).slice(0, 5)}–${dmy(ds.at(-1))}`) : '';
  mount(host,
    h('div', {class: 'info-head'},
      h('div', null, h('h2', null, f.properties.full_name || f.properties.name), h('div', {class: 'sub'}, `Mùa khô ${s.year}${dates ? ' · ảnh chụp ' + dates : ''}`)),
      h('button', {class: 'info-x', type: 'button', 'aria-label': 'Bỏ chọn khu vực', on: {click: () => store.set({selected: null})}}, icon('x', 16))),
    h('div', {class: 'vals'}, vals),
    tv != null && tv >= TVDI_ALERT ? h('div', {class: 'info-alert'}, `Độ khô ${fmt(tv, 2)} (${tvdiClass(tv).name.toLowerCase()}) · chỉ số thử nghiệm, không phải cảnh báo hạn chính thức`) : null,
    h('div', {class: 'info-foot'}, h('span', null, `${INDEX[s.index].code} 2020–2025`), spark(series, s.index)),
    h('a', {class: 'link-btn', href: '#/du-bao'}, icon('trend', 14), 'Xem dự báo tháng của khu vực này'));
}

// ---------- legend ----------
export function renderLegend(host, s, {matchCount}) {
  const spec = INDEX[s.index], pixel = s.mode === 'pixel';
  mount(host,
    h('h3', null, h('span', null, indexTitle(s.index), infoButton(s.index)), h('small', null, pixel ? 'ô ảnh 120 m' : 'trung bình xã/phường')),
    h('p', {class: 'legend-what'}, spec.what),
    h('div', {class: 'ramp', style: {background: rampCss(s.index)}}),
    h('div', {class: 'ends'}, h('span', null, fmt(spec.min, spec.digits === 1 ? 0 : 1)), h('span', null, spec.experimental ? 'thử nghiệm' : ''), h('span', null, fmt(spec.max, spec.digits === 1 ? 0 : 1))),
    h('div', {class: 'keys'},
      !pixel && h('span', null, h('i', {style: {background: '#c3ccd5'}}), 'Chưa đủ dữ liệu (độ phủ < 50%)'),
      pixel && h('span', null, h('i', {style: {background: 'transparent', border: '1px dashed #8a98a8'}}), 'Trống: không có ảnh dùng được'),
      matchCount != null && !pixel && h('span', null, h('i', {style: {background: '#e3e8ec'}}), `Mờ: không thỏa điều kiện lọc (${matchCount} thỏa)`),
      s.dims === '3d' && !pixel && h('span', null, '▮ Chiều cao khối theo giá trị (phóng đại)')),
    pixel && s.palette === 'cb' ? h('p', {class: 'legend-note'}, 'Ô ảnh 120 m luôn dùng thang màu gốc của tài liệu.') : null,
    h('details', {class: 'legend-more'}, h('summary', null, 'Lưu ý khi đọc'),
      h('p', null, 'Mỗi năm là một lần chụp trong mùa khô, các cảnh có thể khác ngày. Chênh lệch giữa các năm không phải xu thế khí hậu.'),
      s.index === 'tvdi' ? h('p', null, 'TVDI là chỉ số thử nghiệm: chưa kiểm định bằng độ ẩm đất và có thể đổi theo cảnh ảnh được chọn. Chỉ dùng để mô tả, không kết luận hạn hán.') : null,
      s.index === 'lst' ? h('p', null, 'LST là nhiệt độ bề mặt lúc vệ tinh chụp, không phải nhiệt độ không khí.') : null));
}

// ---------- timeline ----------
export function createTimeline(host, store) {
  let timer = 0;
  const play = h('button', {class: 'tl-play', type: 'button', 'aria-label': 'Phát diễn biến theo năm'});
  const yearBox = h('div', {class: 'tl-year'}, h('b'), h('small', null, 'mùa khô'));
  const range = h('div', {class: 'tl-range'});
  const ticks = h('div', {class: 'tl-ticks'}, ...YEARS.map(y => h('button', {class: 'tl-tick', type: 'button', dataset: {year: y}, 'aria-label': `Năm ${y}`, on: {click: () => { stop(); store.set({year: y}); }}}, h('i'), h('span', null, y))));
  const track = h('div', {class: 'tl-track'}, h('div', {class: 'tl-rail'}), range, ticks);
  const sel = (label, value, on) => h('select', {class: 'select', 'aria-label': label, on: {change: e => on(+e.target.value)}}, ...YEARS.map(y => h('option', {value: y, selected: y === value}, y)));
  const from = sel('Từ năm', store.get().range[0], v => { const [, b] = store.get().range; store.set({range: [Math.min(v, b), Math.max(v, b)]}); });
  const to = sel('Đến năm', store.get().range[1], v => { const [a] = store.get().range; store.set({range: [Math.min(a, v), Math.max(a, v)]}); });
  const speed = h('select', {class: 'select', 'aria-label': 'Tốc độ phát', on: {change: () => { if (timer) { stop(); start(); } }}},
    h('option', {value: 2600}, 'Chậm'), h('option', {value: 1700, selected: true}, 'Vừa'), h('option', {value: 1000}, 'Nhanh'));
  mount(host, play, yearBox, track, h('div', {class: 'tl-opts'}, 'Từ', from, 'đến', to, speed));

  function step() {
    const {year, range: [a, b]} = store.get();
    store.set({year: year >= b || year < a ? a : year + 1, animate: true});
  }
  function start() {
    const {year, range: [a, b]} = store.get();
    if (year < a || year >= b) store.set({year: a, animate: true});
    timer = setInterval(step, +speed.value);
    store.set({playing: true});
  }
  function stop() { clearInterval(timer); timer = 0; if (store.get().playing) store.set({playing: false}); }
  play.addEventListener('click', () => timer ? stop() : start());

  function render(s) {
    yearBox.firstChild.textContent = s.year;
    mount(play, icon(s.playing ? 'pause' : 'play', 18)); play.setAttribute('aria-label', s.playing ? 'Dừng phát' : 'Phát diễn biến theo năm');
    const [a, b] = s.range, n = YEARS.length - 1, pos = y => (YEARS.indexOf(y) / n);
    range.style.left = `calc(14px + (100% - 28px) * ${pos(a)})`; range.style.width = `calc((100% - 28px) * ${pos(b) - pos(a)})`;
    [...ticks.children].forEach(t => { const y = +t.dataset.year; t.classList.toggle('in', y >= a && y <= b); t.setAttribute('aria-current', String(y === s.year)); });
    from.value = a; to.value = b;
  }
  store.subscribe(render); render(store.get());
  return {stop};
}
