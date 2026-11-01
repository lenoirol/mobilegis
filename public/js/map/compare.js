/* Compare two years: a second, non-interactive map sits on top of the main one and is clipped by a draggable divider.
   The left side shows the year of the timeline, the right side shows the chosen comparison year. Cameras are kept identical. */
import {h, mount, icon} from '../core/dom.js';
import {YEARS} from '../core/format.js';
import {createMap} from './engine.js';
import {matching} from './panel.js';

export function createCompare({host, handleHost, geo, rows, products, ranges, padding, main, store, codes}) {
  let eng = null, ratio = 0.5, syncing = false;
  const label = (cls, ...kids) => h('div', {class: 'cmp-chip ' + cls}, ...kids);
  const left = label('l'), select = h('select', {class: 'select', 'aria-label': 'Năm so sánh', on: {change: () => store.set({compare: {on: true, year: +select.value}})}}, ...YEARS.map(y => h('option', {value: y}, y)));
  const right = label('r', 'so với ', select);
  const knob = h('div', {class: 'cmp-knob', role: 'slider', tabindex: 0, 'aria-label': 'Kéo để so sánh hai năm', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 50}, icon('compare', 18));
  const line = h('div', {class: 'cmp-line'}, knob);
  mount(handleHost, left, right, line);

  function place() {
    host.style.clipPath = `inset(0 0 0 ${ratio * 100}%)`;
    line.style.left = ratio * 100 + '%'; left.style.left = `calc(${ratio * 100}% - 12px)`; right.style.left = `calc(${ratio * 100}% + 12px)`;
    knob.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }
  const setRatio = x => { ratio = Math.max(0.05, Math.min(0.95, x / innerWidth)); place(); };
  knob.addEventListener('pointerdown', e => { knob.setPointerCapture(e.pointerId); knob.dataset.drag = '1'; e.preventDefault(); });
  knob.addEventListener('pointermove', e => { if (knob.dataset.drag) setRatio(e.clientX); });
  knob.addEventListener('pointerup', () => { delete knob.dataset.drag; });
  knob.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { setRatio(ratio * innerWidth - 30); e.preventDefault(); } if (e.key === 'ArrowRight') { setRatio(ratio * innerWidth + 30); e.preventDefault(); } });

  function ensure() {
    if (eng) return eng;
    eng = createMap(host, {geo, rows, products, ranges, padding, controls: false, interactive: false, onSelect() {}});
    const follow = () => { if (syncing) return; syncing = true; const m = main.map; eng.map.jumpTo({center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch()}); syncing = false; };
    main.map.on('move', follow);
    eng.ready.then(follow);
    return eng;
  }
  function sync(s, p = {}) {
    const on = !!s.compare?.on;
    host.hidden = !on; handleHost.hidden = !on;
    document.body.classList.toggle('comparing', on);
    if (!on) return;
    const e = ensure();
    select.value = s.compare.year; left.textContent = s.year;
    e.update({index: s.index, year: s.compare.year, mode: s.mode, dims: s.dims, basemap: s.basemap});
    e.setHeight(s.height); e.setDim(matching(s.filters, rows, codes, s.compare.year)); e.select(s.selected);
    if (!p.compare?.on) { requestAnimationFrame(() => { e.resize(); place(); }); }
    place();
  }
  window.addEventListener('resize', () => { if (eng) eng.resize(); });
  return {sync, repaint: () => eng?.repaint()};
}
