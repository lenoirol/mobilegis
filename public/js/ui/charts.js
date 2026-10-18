/* Chart kit (SVG, no dependencies). Thin marks, recessive grid, direct labels, hover/focus tooltips, entrance motion.
   Missing values are gaps, never zeros; lines never bridge a gap. Categorical colours follow the validated reference order. */
import {h, svg} from '../core/dom.js';
import {fmt, valid} from '../core/format.js';
import {drawPath} from '../core/motion.js';

export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];   // blue, orange, aqua, yellow (fixed order)
export const INK = '#0e0e0c';

// ---- helpers --------------------------------------------------------------------------------
export function niceTicks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) { const pad = Math.abs(lo) * .1 || 1; lo -= pad; hi += pad; }
  const step0 = (hi - lo) / Math.max(1, count - 1), mag = 10 ** Math.floor(Math.log10(step0)), norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * .5; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}
const decimals = ticks => { const step = Math.abs((ticks[1] ?? 1) - ticks[0]); return step >= 1 ? 0 : step >= .1 ? 1 : 2; };

let tipNode = null;
function tip() {
  if (!tipNode) { tipNode = h('div', {class: 'ch-tip', role: 'tooltip', hidden: true}); document.body.append(tipNode); }
  return tipNode;
}
function showTip(event, lines, anchor) {
  const node = tip();
  node.replaceChildren(...lines.map((line, i) => h(i === 0 ? 'b' : 'span', null, line)));
  node.hidden = false;
  const box = node.getBoundingClientRect();
  const x = anchor ? anchor.x : event.clientX, y = anchor ? anchor.y : event.clientY;
  node.style.left = Math.max(8, Math.min(innerWidth - box.width - 8, x + 14)) + 'px';
  node.style.top = Math.max(8, y - box.height - 12 < 8 ? y + 18 : y - box.height - 12) + 'px';
}
const hideTip = () => { if (tipNode) tipNode.hidden = true; };
function bindTip(node, lines) {
  node.addEventListener('pointermove', e => showTip(e, lines));
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => { const r = node.getBoundingClientRect(); showTip(null, lines, {x: r.left + r.width / 2, y: r.top}); });
  node.addEventListener('blur', hideTip);
  node.addEventListener('click', e => showTip(e, lines));   // touch: tap to read
}

/** Draw `render(width)` into `container` now and whenever the container width changes. */
function responsive(container, render) {
  let last = 0, first = true;
  const run = () => {
    const width = Math.max(240, Math.floor(container.clientWidth));
    if (width === last) return;
    last = width;
    const node = render(width, first);
    first = false;
    container.replaceChildren(node);
  };
  container.classList.add('ch-host');
  run();
  const observer = new ResizeObserver(() => requestAnimationFrame(run));
  observer.observe(container);
  return {destroy: () => observer.disconnect(), redraw: () => { last = 0; first = false; run(); }};
}
const root = (width, height, label) => svg('svg', {class: 'ch', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label});
const empty = (width, height, message, label) => {
  const s = root(width, height, label);
  s.append(svg('text', {class: 'ch-empty', x: width / 2, y: height / 2, 'text-anchor': 'middle'}, message));
  return s;
};
function yAxis(s, ticks, y, left, right, format) {
  for (const t of ticks) {
    s.append(svg('line', {class: 'ch-grid', x1: left, x2: right, y1: y(t), y2: y(t)}), svg('text', {class: 'ch-text', x: left - 8, y: y(t) + 4, 'text-anchor': 'end'}, format(t)));
  }
}

// ---- line chart (years on x) ------------------------------------------------------------------------
/**
 * series: [{id, name, color, dashed, points: [{x, y|null, lines?:[tooltip lines]}]}]
 * opts: {xs, yFormat, unit, height, domain:[lo,hi]?, label, compact, showLabels}
 */
export function lineChart(container, series, opts = {}) {
  const {xs = [2020, 2021, 2022, 2023, 2024, 2025], height = 240, label = 'Biểu đồ đường', compact = false, unit = ''} = opts;
  return responsive(container, (width, animate) => {
    const values = series.flatMap(s => s.points.map(p => p.y)).filter(valid);
    if (!values.length) return empty(width, compact ? 120 : height, opts.emptyText || 'Chưa có mốc đủ độ phủ', label);
    const H = compact ? 150 : height, pad = {l: compact ? 40 : 54, r: compact ? 14 : 24, t: 16, b: 28};
    let lo = opts.domain?.[0] ?? Math.min(...values), hi = opts.domain?.[1] ?? Math.max(...values);
    if (opts.domain == null) { const m = Math.max((hi - lo) * .18, opts.minPad ?? 0); lo -= m; hi += m; }
    const ticks = niceTicks(lo, hi, compact ? 3 : 5), d = decimals(ticks);
    const format = opts.yFormat || (v => fmt(v, d));
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));
    const x = v => pad.l + (xs.indexOf(v) / Math.max(1, xs.length - 1)) * (width - pad.l - pad.r);
    const y = v => H - pad.b - (v - lo) / (hi - lo || 1) * (H - pad.b - pad.t);
    const s = root(width, H, label);
    yAxis(s, ticks, y, pad.l, width - pad.r, format);
    for (const xv of xs) s.append(svg('text', {class: 'ch-text', x: x(xv), y: H - 8, 'text-anchor': 'middle'}, String(xv)));
    // direct labels at each series' last point, pushed apart so they never overlap
    const labelY = new Map();
    if (!compact && series.length > 1) {
      const ends = series.map((serie, si) => { const lp = [...serie.points].reverse().find(p => valid(p.y)); return lp ? {si, y: y(lp.y)} : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
      ends.forEach(e => labelY.set(e.si, e.y));
    }
    series.forEach((serie, si) => {
      const color = serie.color || SERIES_COLORS[si % SERIES_COLORS.length];
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const path = svg('path', {class: 'ch-line', d: run.map((p, i) => `${i ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(''), stroke: color, 'stroke-dasharray': serie.dashed ? '7 4' : null});
          s.append(path); if (animate) requestAnimationFrame(() => drawPath(path, 800));
        }
        run = [];
      };
      for (const p of serie.points) { if (valid(p.y)) run.push(p); else flush(); }
      flush();
      serie.points.filter(p => valid(p.y)).forEach((p, i) => {
        const dot = svg('circle', {class: 'ch-dot' + (animate ? ' pop' : ''), cx: x(p.x), cy: y(p.y), r: compact ? 4 : 5, fill: color, tabindex: 0, style: `animation-delay:${300 + i * 70}ms`,
          'aria-label': `${serie.name} ${p.x}: ${format(p.y)} ${unit}`.trim()});
        bindTip(dot, [`${serie.name} · ${p.x}`, `${format(p.y)} ${unit}`.trim(), ...(p.lines || [])]);
        s.append(dot);
        if (opts.showLabels !== false && !compact && series.length === 1) s.append(svg('text', {class: 'ch-val', x: x(p.x), y: y(p.y) - 11, 'text-anchor': 'middle'}, format(p.y)));
      });
      // direct label at the last point (≤ 4 series)
      const lastPoint = [...serie.points].reverse().find(p => valid(p.y));
      if (!compact && series.length > 1 && lastPoint) {
        const lx = x(lastPoint.x), anchorEnd = lx > width - 110;
        s.append(svg('text', {class: 'ch-direct', x: anchorEnd ? lx - 8 : lx + 8, y: (labelY.get(si) ?? y(lastPoint.y)) - (anchorEnd ? 12 : 0) + 4, 'text-anchor': anchorEnd ? 'end' : 'start', fill: color}, serie.short || serie.name));
      }
    });
    return s;
  });
}

// ---- horizontal bars ---------------------------------------------------------------------------------------
/** items: [{label, value, color?, note?: [lines]}] */
export function barChart(container, items, opts = {}) {
  const {digits = 1, unit = '', label = 'Biểu đồ cột', rowH = 34} = opts;
  return responsive(container, (width, animate) => {
    if (!items.length) return empty(width, 90, opts.emptyText || 'Không có mẫu đủ độ phủ ở bộ lọc này.', label);
    const left = Math.min(190, Math.max(96, Math.floor(width * .34))), right = 64, top = 6, H = top + items.length * rowH + 8;
    const lo = Math.min(0, ...items.map(i => i.value)), hi = Math.max(0, ...items.map(i => i.value)) || 1;
    const x = v => left + (v - lo) / (hi - lo) * (width - left - right);
    const s = root(width, H, label);
    s.append(svg('line', {class: 'ch-axis', x1: x(0), x2: x(0), y1: top, y2: H - 6}));
    items.forEach((item, i) => {
      const y = top + i * rowH, x0 = x(Math.min(0, item.value)), w = Math.max(3, Math.abs(x(item.value) - x(0)));
      const name = item.label.length > 24 ? item.label.slice(0, 23) + '…' : item.label;
      const row = svg('g', {class: 'ch-row'});
      row.append(svg('text', {class: 'ch-text lbl', x: left - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end'}, name));
      const bar = svg('rect', {class: 'ch-bar h' + (animate ? ' grow' : ''), x: x0, y: y + 5, width: w, height: rowH - 12, rx: 3, fill: item.color || INK, style: `animation-delay:${i * 40}ms`, tabindex: 0, 'aria-label': `${item.label}: ${fmt(item.value, digits)} ${unit}`.trim()});
      bindTip(bar, [item.label, `${fmt(item.value, digits)} ${unit}`.trim(), ...(item.note || [])]);
      row.append(bar, svg('text', {class: 'ch-val', x: x(item.value) + (item.value >= 0 ? 8 : -8), y: y + rowH / 2 + 4, 'text-anchor': item.value >= 0 ? 'start' : 'end'}, fmt(item.value, digits)));
      s.append(row);
    });
    return s;
  });
}

// ---- histogram ----------------------------------------------------------------------------------------------
export function histogramChart(container, {edges, counts}, opts = {}) {
  const {unit = '', digits = 0, label = 'Histogram', height = 230} = opts;
  return responsive(container, (width, animate) => {
    const first = counts.findIndex(n => n > 0), last = counts.findLastIndex(n => n > 0);
    if (first < 0) return empty(width, height, 'Không có mẫu đủ độ phủ ở bộ lọc này.', label);
    const sub = counts.slice(first, last + 1), pad = {l: 56, r: 16, t: 14, b: 40}, H = height;
    const ticks = niceTicks(0, Math.max(...sub), 4);
    const y = v => H - pad.b - v / ticks.at(-1) * (H - pad.b - pad.t);
    const slot = (width - pad.l - pad.r) / sub.length;
    const s = root(width, H, label);
    yAxis(s, ticks, y, pad.l, width - pad.r, v => v >= 1000 ? (v / 1000).toLocaleString('vi-VN') + 'k' : String(v));
    sub.forEach((n, i) => {
      const bar = svg('rect', {class: 'ch-bar v' + (animate ? ' grow-y' : ''), x: pad.l + i * slot + 1, y: y(n), width: Math.max(2, slot - 2), height: Math.max(0, H - pad.b - y(n)), rx: 2, fill: INK, style: `animation-delay:${i * 12}ms`, tabindex: n ? 0 : -1,
        'aria-label': `${fmt(edges[first + i], digits)} đến ${fmt(edges[first + i + 1], digits)}: ${n} pixel`});
      bindTip(bar, [`${fmt(edges[first + i], digits)} – ${fmt(edges[first + i + 1], digits)} ${unit}`.trim(), `${n.toLocaleString('vi-VN')} pixel`]);
      s.append(bar);
      if (i % Math.max(1, Math.ceil(sub.length / Math.floor((width - pad.l) / 56))) === 0) s.append(svg('text', {class: 'ch-text', x: pad.l + i * slot, y: H - 22, 'text-anchor': 'start'}, fmt(edges[first + i], digits)));
    });
    s.append(svg('text', {class: 'ch-text', x: width - pad.r, y: H - 6, 'text-anchor': 'end'}, unit || ''));
    return s;
  });
}

// ---- box plot (horizontal) ---------------------------------------------------------------------------------------------------
/** boxes: [{label, min, q25, median, q75, max}] */
export function boxChart(container, boxes, opts = {}) {
  const {digits = 1, unit = '', label = 'Biểu đồ hộp', rowH = 44} = opts;
  return responsive(container, (width, animate) => {
    if (!boxes.length) return empty(width, 90, 'Không có mẫu đủ độ phủ ở bộ lọc này.', label);
    const left = Math.min(170, Math.max(90, Math.floor(width * .3))), right = 18, top = 8, H = top + boxes.length * rowH + 30;
    const lo = Math.min(...boxes.map(b => b.min)), hi = Math.max(...boxes.map(b => b.max)), ticks = niceTicks(lo, hi, 5);
    const x = v => left + (v - ticks[0]) / ((ticks.at(-1) - ticks[0]) || 1) * (width - left - right), d = decimals(ticks);
    const s = root(width, H, label);
    for (const t of ticks) s.append(svg('line', {class: 'ch-grid', x1: x(t), x2: x(t), y1: top, y2: H - 24}), svg('text', {class: 'ch-text', x: x(t), y: H - 8, 'text-anchor': 'middle'}, fmt(t, d)));
    boxes.forEach((b, i) => {
      const cy = top + i * rowH + rowH / 2, g = svg('g', {class: 'ch-box' + (animate ? ' grow' : ''), style: `animation-delay:${i * 50}ms`, tabindex: 0, 'aria-label': `${b.label}: trung vị ${fmt(b.median, digits)} ${unit}`.trim()});
      g.append(svg('line', {class: 'ch-whisker', x1: x(b.min), x2: x(b.max), y1: cy, y2: cy}), svg('line', {class: 'ch-whisker', x1: x(b.min), x2: x(b.min), y1: cy - 7, y2: cy + 7}), svg('line', {class: 'ch-whisker', x1: x(b.max), x2: x(b.max), y1: cy - 7, y2: cy + 7}),
        svg('rect', {class: 'ch-iqr', x: x(b.q25), y: cy - 11, width: Math.max(2, x(b.q75) - x(b.q25)), height: 22, rx: 3}), svg('line', {class: 'ch-median', x1: x(b.median), x2: x(b.median), y1: cy - 11, y2: cy + 11}));
      bindTip(g, [b.label, `Trung vị ${fmt(b.median, digits)} ${unit}`.trim(), `Q25–Q75: ${fmt(b.q25, digits)} – ${fmt(b.q75, digits)}`, `Min–Max: ${fmt(b.min, digits)} – ${fmt(b.max, digits)}`]);
      s.append(svg('text', {class: 'ch-text lbl', x: left - 10, y: cy + 4, 'text-anchor': 'end'}, b.label.length > 22 ? b.label.slice(0, 21) + '…' : b.label), g);
    });
    return s;
  });
}

// ---- scatter ----------------------------------------------------------------------------------------------------------------------------------
/** points: [{x, y, color, lines: [tooltip], label}] */
export function scatterChart(container, points, opts = {}) {
  const {xLabel = '', yLabel = '', xDigits = 2, yDigits = 0, label = 'Biểu đồ phân tán', height = 320, onPick} = opts;
  return responsive(container, (width, animate) => {
    if (!points.length) return empty(width, 120, 'Chưa có cặp giá trị đủ độ phủ', label);
    const pad = {l: 50, r: 16, t: 14, b: 44}, H = height;
    const xt = niceTicks(Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x)), 5), yt = niceTicks(Math.min(...points.map(p => p.y)), Math.max(...points.map(p => p.y)), 5);
    const x = v => pad.l + (v - xt[0]) / ((xt.at(-1) - xt[0]) || 1) * (width - pad.l - pad.r), y = v => H - pad.b - (v - yt[0]) / ((yt.at(-1) - yt[0]) || 1) * (H - pad.b - pad.t);
    const s = root(width, H, label);
    yAxis(s, yt, y, pad.l, width - pad.r, v => fmt(v, yDigits));
    for (const t of xt) s.append(svg('line', {class: 'ch-grid v', x1: x(t), x2: x(t), y1: pad.t, y2: H - pad.b}), svg('text', {class: 'ch-text', x: x(t), y: H - 24, 'text-anchor': 'middle'}, fmt(t, xDigits)));
    s.append(svg('text', {class: 'ch-text', x: (pad.l + width - pad.r) / 2, y: H - 6, 'text-anchor': 'middle'}, xLabel), svg('text', {class: 'ch-text', x: 6, y: 12}, yLabel));
    points.forEach((p, i) => {
      const dot = svg('circle', {class: 'ch-pt' + (animate ? ' pop' : ''), cx: x(p.x), cy: y(p.y), r: 5, fill: p.color || INK, tabindex: 0, style: `animation-delay:${Math.min(i * 4, 700)}ms`, 'aria-label': p.label});
      bindTip(dot, [p.label, ...(p.lines || [])]);
      if (onPick) dot.addEventListener('click', () => onPick(p));
      s.append(dot);
    });
    return s;
  });
}

// ---- stacked single bar (land cover) -------------------------------------------------------------------------------------------------------------
export function stackBar(items, {height = 14} = {}) {
  const bar = h('div', {class: 'stackbar', style: {height: height + 'px'}, role: 'img', 'aria-label': items.map(i => `${i.name} ${fmt(i.percent, 1)}%`).join(', ')});
  items.forEach((item, i) => bar.append(h('span', {style: {width: item.percent + '%', background: item.color, animationDelay: i * 50 + 'ms'}, title: `${item.name}: ${fmt(item.percent, 1)}%`})));
  return bar;
}

/** Serialize a chart for download with theme variables resolved to real colours. */
const EXPORT_PROPS = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'stroke-dasharray'];
export function chartToSvgText(node) {
  const clone = node.cloneNode(true), sources = [node, ...node.querySelectorAll('*')], targets = [clone, ...clone.querySelectorAll('*')];
  sources.forEach((src, i) => {
    const computed = getComputedStyle(src);
    targets[i].removeAttribute('class');
    targets[i].setAttribute('style', EXPORT_PROPS.map(p => `${p}:${computed.getPropertyValue(p)}`).join(';'));
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.insertBefore(svg('rect', {width: '100%', height: '100%', fill: '#ffffff'}), clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}
