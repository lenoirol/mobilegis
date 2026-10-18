/* Left control dock of the map view: search, index, year, display mode, layers, basemap, advanced sources. */
import {h, icon, mount} from '../core/dom.js';
import {INDEX, INDICES, rampCss, normalize, SOURCES} from '../core/format.js';
import {segmented} from '../ui/seg.js';
import {env} from '../core/api.js';

const DISPLAY = [
  {value: 'raster', label: 'Chi tiết', title: 'Từng ô ảnh vệ tinh 120 m'},
  {value: 'zones', label: 'Xã/phường', title: 'Tô vùng theo trung bình, chỉ hiện nơi đủ mẫu'},
  {value: 'change', label: 'Thay đổi', title: 'Chênh lệch 2025 − 2020 trên các ô hợp lệ cả hai mốc'},
  {value: 'coverage', label: 'Độ tin cậy', title: 'Mức đầy đủ của dữ liệu từng khu vực'},
];
const DISPLAY_HINT = {
  raster: 'Mỗi ô 120 m một màu. Vùng không màu là thiếu mẫu hợp lệ (mây, mất dữ liệu), không phải giá trị 0.',
  zones: 'Trung bình các ô hợp lệ của từng xã/phường. Xám nét đứt: thiếu hoặc độ phủ dưới 50%, không tô theo số ít mẫu.',
  change: 'Giá trị 2025 trừ 2020, chỉ ở ô hợp lệ cả hai năm. Khác với hiệu hai trung bình khu vực.',
  coverage: 'Tỷ lệ phần ảnh dùng được của từng khu vực. Đây là mức đầy đủ của dữ liệu, không phải độ chính xác.',
};

export function createDock({onIndex, onYear, onDisplay, onToggle, onPick, onPlay, onSource, onMode, onOpacity}) {
  let state = null, ctx = null;
  const searchInput = h('input', {class: 'input', type: 'search', placeholder: 'Nhập tên xã/phường…', autocomplete: 'off', 'aria-label': 'Tìm xã/phường hoặc mã hành chính'});
  const results = h('div', {class: 'dock-results', role: 'listbox', 'aria-label': 'Kết quả tìm kiếm'});
  searchInput.addEventListener('input', () => renderResults());
  searchInput.addEventListener('focus', () => renderResults());

  // index cards
  const indexButtons = INDICES.map(key => {
    const spec = INDEX[key];
    return h('button', {class: 'idx-card', type: 'button', dataset: {index: key}, 'aria-pressed': 'false', on: {click: () => onIndex(key)}},
      h('span', {class: 'idx-top'}, h('b', null, spec.label + (spec.experimental ? '*' : '')), spec.unit ? h('small', null, spec.unit) : null),
      h('span', {class: 'idx-name'}, spec.name), h('i', {class: 'idx-ramp', style: {background: rampCss(key)}}));
  });
  const indexHelp = h('p', {class: 'dock-help'});

  // year
  const yearNum = h('span', {class: 'year-num mono'}, '2025');
  const yearTag = h('span', {class: 'tag signal year-tag'}, 'Mốc ảnh');
  const slider = h('input', {type: 'range', min: 2020, max: 2025, step: 1, value: 2025, 'aria-label': 'Mốc năm'});
  slider.addEventListener('input', () => { setFill(); onYear(+slider.value); });
  const ticks = h('div', {class: 'year-ticks mono'});
  const playBtn = h('button', {class: 'btn sm', type: 'button', on: {click: () => onPlay()}});
  const setFill = () => slider.style.setProperty('--fill', ((slider.value - slider.min) / ((slider.max - slider.min) || 1) * 100) + '%');

  const displaySeg = segmented(DISPLAY, 'raster', v => onDisplay(v), {label: 'Chế độ hiển thị', layout: 'grid2'});
  const displayHint = h('p', {class: 'dock-help'});
  const basemapSeg = segmented([{value: 'voyager', label: 'Bản đồ', title: 'Bản đồ thế giới · cần Internet'}, {value: 'satellite', label: 'Vệ tinh', title: 'Ảnh vệ tinh thế giới · cần Internet'}, {value: 'streets', label: 'Đường phố', title: 'OpenStreetMap · cần Internet'}, {value: 'plain', label: 'Nhẹ', title: 'Không cần Internet'}, {value: 'rgb2020', label: 'Ảnh 2020'}, {value: 'rgb2025', label: 'Ảnh 2025'}], 'voyager', v => onToggle('basemap', v), {label: 'Bản đồ nền', layout: 'grid2'});
  const baseNote = h('p', {class: 'dock-help'});

  const checks = {};
  const check = (key, label, extra) => {
    const input = h('input', {type: 'checkbox', on: {change: e => onToggle(key, e.target.checked)}});
    checks[key] = input;
    return h('label', {class: 'check'}, input, label, extra);
  };
  const opacity = h('input', {type: 'range', min: 10, max: 100, step: 5, value: 100, 'aria-label': 'Độ đậm của lớp'});
  const opacityVal = h('span', {class: 'mono'}, '100%');
  opacity.addEventListener('input', () => { opacity.style.setProperty('--fill', opacity.value + '%'); opacityVal.textContent = opacity.value + '%'; onOpacity(+opacity.value / 100); });

  const sourceSeg = segmented(Object.values(SOURCES).map(s => ({value: s.id, label: s.label})), 'gee_recovery', v => onSource(v), {label: 'Nguồn dữ liệu', layout: 'col'});
  const sourceNote = h('p', {class: 'dock-help'});
  const modeSeg = segmented([{value: 'real', label: 'Landsat 167 khu vực'}, {value: 'user', label: 'CSV 4 điểm'}, {value: 'demo', label: 'Điểm thực hành'}], 'real', v => onMode(v), {label: 'Bộ dữ liệu', layout: 'col'});

  const group = (title, ...kids) => h('section', {class: 'dock-group'}, h('h3', {class: 'dock-title'}, title), ...kids);
  const advanced = h('details', {class: 'dock-adv admin-only'}, h('summary', null, 'Nâng cao · đối chiếu nguồn'),
    h('div', {class: 'dock-adv-body'}, h('p', {class: 'dock-help'}, 'Dành cho đối chiếu. Mặc định là bộ hiện trạng GEE đã bổ sung 2025; các lựa chọn khác không trộn với bộ này.'), sourceSeg.el, sourceNote, modeSeg.el));

  const el = h('div', {class: 'dock-inner'},
    h('div', {class: 'dock-head'}, h('span', {class: 'eyebrow'}, 'TP. Hồ Chí Minh · mùa khô 2020–2025'), h('h1', null, 'Bản đồ môi trường')),
    group('Tìm khu vực', h('div', {class: 'search-wrap'}, icon('search', 18), searchInput), results),
    group('Xem gì?', h('div', {class: 'idx-grid'}, ...indexButtons), indexHelp),
    group('Năm', h('div', {class: 'year-row'}, yearNum, yearTag, playBtn), slider, ticks),
    group('Cách xem', displaySeg.el, displayHint),
    group('Lớp phủ', check('visible', 'Lớp chỉ số đang xem (nhiệt độ / độ xanh / độ khô)'), check('boundaries', 'Ranh giới xã/phường'), check('labels', 'Tên khu vực (tự tránh chồng)'), check('landcover', 'Lớp phủ đất ESA 2021'), check('compare', 'So sánh kéo màn hình 2020 | năm chọn'),
      h('div', {class: 'opacity-row'}, h('span', {class: 'field'}, h('span', null, 'Độ đậm của lớp')), opacityVal), opacity),
    group('Bản đồ nền', basemapSeg.el, baseNote), advanced);

  // Search, year and the (desktop) index cards stay on top; display/overlay/basemap/source options live in one collapsible block.
  const groups = [...el.querySelectorAll(':scope > .dock-group')];   // search, index, year, display, layers, basemap
  ['g-search', 'g-index', 'g-year'].forEach((name, i) => groups[i].classList.add(name));
  const more = h('details', {class: 'dock-more'}, h('summary', null, 'Tùy chọn bản đồ'));
  more.append(groups[3], groups[4], groups[5], advanced);
  el.append(more);
  const phone = matchMedia('(max-width:860px)');
  const fitMore = () => { more.open = !phone.matches; };   // always open on desktop, collapsed on phones
  fitMore(); phone.addEventListener('change', fitMore);
  more.addEventListener('toggle', () => requestAnimationFrame(() => { displaySeg.place(); basemapSeg.place(); sourceSeg.place(); modeSeg.place(); }));

  function renderResults() {
    const q = normalize(searchInput.value.trim());
    const list = (ctx?.search || []).filter(x => !q || normalize(x.name + ' ' + x.id).includes(q));
    mount(results, ...list.slice(0, q ? 12 : 5).map(x => h('button', {class: 'res', type: 'button', role: 'option', on: {click: () => { searchInput.value = ''; results.replaceChildren(); onPick(x.id); }}},
      h('b', null, x.name), h('small', {class: 'mono'}, x.id))), q && list.length > 12 ? h('small', {class: 'muted'}, `${list.length} khu vực · gõ thêm để lọc`) : null,
      q && !list.length ? h('small', {class: 'muted'}, 'Không tìm thấy khu vực.') : null);
    results.classList.toggle('on', !!results.children.length);
  }

  return {
    el,
    /** state = merged shared+map state; context = {years, search, canChange, canCompare, source, playing}. */
    sync(next, context) {
      state = next; ctx = context;
      indexButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.index === state.index)));
      indexHelp.textContent = INDEX[state.index].help;
      const years = context.years.length ? context.years : [2020, 2025];
      slider.min = years[0]; slider.max = years.at(-1); slider.value = state.year; slider.disabled = state.display === 'change' || state.landcover;
      setFill();
      const label = state.landcover ? '2021' : state.display === 'change' ? '2020→2025' : String(state.year);
      if (yearNum.textContent !== label) { yearNum.textContent = label; yearNum.classList.remove('bump'); void yearNum.offsetWidth; yearNum.classList.add('bump'); }
      yearTag.textContent = state.landcover ? 'Lớp phủ' : state.display === 'change' ? 'Hai mốc' : 'Mốc ảnh';
      mount(ticks, ...years.map(y => h('span', {class: y === state.year ? 'on' : ''}, String(y))));
      playBtn.replaceChildren(icon(context.playing ? 'pause' : 'play', 16), context.playing ? 'Tạm dừng' : 'Phát');
      playBtn.disabled = years.length < 2 || state.display === 'change' || state.landcover || state.mode !== 'real';
      displaySeg.set(state.display); displaySeg.setDisabled([...(context.canChange ? [] : ['change']), ...(state.mode === 'real' ? [] : ['raster', 'zones', 'change', 'coverage'])]);
      displayHint.textContent = DISPLAY_HINT[state.display];
      checks.visible.checked = state.visible; checks.boundaries.checked = state.boundaries; checks.labels.checked = state.labels; checks.landcover.checked = state.landcover; checks.compare.checked = state.compare;
      checks.compare.disabled = !context.canCompare || state.display !== 'raster' || state.landcover || state.mode !== 'real'; checks.landcover.disabled = state.mode !== 'real';
      opacity.value = Math.round(state.opacity * 100); opacity.style.setProperty('--fill', opacity.value + '%'); opacityVal.textContent = opacity.value + '%';
      basemapSeg.set(state.basemap);
      baseNote.textContent = state.basemap === 'plain' ? 'Nền nhẹ: số liệu và ranh giới nằm trên máy chủ, không cần Internet.' : state.basemap === 'voyager' ? 'Bản đồ thế giới (dữ liệu OpenStreetMap, CARTO) · cần Internet. Thu nhỏ để xem toàn cầu.' : state.basemap === 'satellite' ? 'Ảnh vệ tinh thế giới (Esri) · cần Internet. Chỉ là ảnh, không có ranh giới quốc gia.' : state.basemap === 'streets' ? 'Bản đồ đường phố OpenStreetMap · cần Internet.' : 'Ảnh nghiên cứu màu tự nhiên của bộ xử lý cũ, dùng làm bối cảnh. Vùng trống là pixel đã bị loại.';
      sourceSeg.set(state.source); modeSeg.set(state.mode); modeSeg.setDisabled(env.api ? [] : ['demo']);
      sourceNote.textContent = SOURCES[state.source]?.long || '';
    },
    resetSearch() { searchInput.value = ''; results.replaceChildren(); results.classList.remove('on'); },
    placeSegs() { displaySeg.place(); basemapSeg.place(); sourceSeg.place(); modeSeg.place(); },
  };
}
