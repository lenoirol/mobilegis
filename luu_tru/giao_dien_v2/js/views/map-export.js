/* Save the current map as a PNG for reports: the map layers exactly as shown, plus a title, legend, scale bar, north arrow and credits.
   It draws from the map's own tiles and canvas, never from a screenshot of the page, so buttons and panels are not in the picture. */
import {INDEX, TVDI_CLASSES, dmy} from '../core/format.js';
import {COVERAGE_RAMP, CHANGE_RAMP} from './map-engine.js';

const DISPLAY_TEXT = {raster: 'Chi tiết từng ô 120 m', zones: 'Trung bình theo xã/phường', change: 'Thay đổi 2025 − 2020', coverage: 'Độ tin cậy dữ liệu'};
const BASE_CREDIT = {streets: 'Nền: © OpenStreetMap', satellite: 'Nền: ảnh Esri, Maxar, Earthstar Geographics', plain: 'Nền: Natural Earth', rgb2020: 'Nền: ảnh Landsat 2020 (USGS)', rgb2025: 'Nền: ảnh Landsat 2025 (USGS)'};
const INK = '#0e0e0c', YELLOW = '#ffd60a';
const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

const sameOrigin = src => { try { return new URL(src, location.href).origin === location.origin; } catch (_) { return true; } };
/** Tiles from other sites must be fetched again with CORS, or the canvas could not be saved. Returns null when the site does not allow it. */
const loadCors = src => new Promise(resolve => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  const timer = setTimeout(() => resolve(null), 9000);
  img.onload = () => { clearTimeout(timer); resolve(img); };
  img.onerror = () => { clearTimeout(timer); resolve(null); };
  img.src = src;
});
const opacityOf = (el, stop) => { let o = 1; for (let n = el; n && n !== stop; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1'); return o; };
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const niceLength = meters => { const p = 10 ** Math.floor(Math.log10(meters)), f = meters / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

function card(g, x, y, w, h) {
  g.fillStyle = INK; roundRect(g, x + 3, y + 3, w, h, 8); g.fill();
  g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2; roundRect(g, x, y, w, h, 8); g.fill(); g.stroke();
}
function gradientBar(g, x, y, w, h, colors) {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
  g.fillStyle = grad; g.fillRect(x, y, w, h); g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
}
function wrap(g, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (g.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * ctx: {map, state, insets, mobile, datesText}. Resolves {blob, name, missingBase}.
 */
export async function renderMapPng({map, state, insets, mobile, datesText}) {
  await document.fonts?.ready;
  const container = map.getContainer(), box = container.getBoundingClientRect();
  const W = box.width, H = box.height;
  // keep only the part of the map that is not under the side panels
  const left = insets.left > 100 ? insets.left : 0, right = insets.right > 100 ? insets.right : 0, bottom = 0;   // on phones the map keeps its full height: the city sits above the sheet, the rest is plain map
  let crop = {x: left, y: 0, w: W - left - right, h: H - bottom};
  if (crop.w < 320 || crop.h < 240) crop = {x: 0, y: 0, w: W, h: H};
  const scale = Math.max(1, Math.min(2, 3200 / crop.w, 3200 / crop.h));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.w * scale); canvas.height = Math.round(crop.h * scale);
  const g = canvas.getContext('2d');
  g.scale(scale, scale); g.translate(-crop.x, -crop.y);
  g.fillStyle = getComputedStyle(container).backgroundColor || '#e8f1fb'; g.fillRect(crop.x, crop.y, crop.w, crop.h);
  const rel = el => { const r = el.getBoundingClientRect(); return {x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height}; };

  // ---- map panes in paint order -------------------------------------------------------------------------
  const mapPane = container.querySelector('.leaflet-map-pane');
  const panes = [...mapPane.children].filter(p => p.classList.contains('leaflet-pane')).map((p, i) => ({p, z: parseInt(getComputedStyle(p).zIndex, 10) || 0, i})).sort((a, b) => a.z - b.z || a.i - b.i);
  const tiles = [];
  for (const {p} of panes) for (const img of p.querySelectorAll('img.leaflet-tile')) if (img.complete && img.naturalWidth) tiles.push({img, pane: p});
  let missingBase = 0;
  const cors = new Map();
  await Promise.all([...new Set(tiles.map(t => t.img.currentSrc || t.img.src).filter(src => !sameOrigin(src)))].map(async src => cors.set(src, await loadCors(src))));
  const clipFor = pane => pane.classList.contains('leaflet-comparison-pane') && state.compare ? {x: 0, w: W * state.swipe / 100} : null;
  for (const {p} of panes) {
    const clip = clipFor(p);
    g.save();
    if (clip) { g.beginPath(); g.rect(clip.x, 0, clip.w, H); g.clip(); }
    for (const {img, pane} of tiles) {
      if (pane !== p) continue;
      const src = img.currentSrc || img.src, source = sameOrigin(src) ? img : cors.get(src);
      if (!source) { missingBase++; continue; }
      const r = rel(img); g.globalAlpha = opacityOf(img, mapPane); g.drawImage(source, r.x, r.y, r.w + .5, r.h + .5);
    }
    g.globalAlpha = 1;
    for (const cv of p.querySelectorAll('canvas')) { const r = rel(cv); if (r.w && r.h) { g.globalAlpha = opacityOf(cv, mapPane); g.drawImage(cv, r.x, r.y, r.w, r.h); } }
    g.restore(); g.globalAlpha = 1;
  }

  // ---- text labels that are real DOM (area names, sea names) ---------------------------------------------
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const tip of container.querySelectorAll('.leaflet-tooltip.mg-label-tip')) {
    const r = rel(tip), sel = tip.classList.contains('sel'), text = tip.textContent.trim();
    if (!text) continue;
    g.fillStyle = sel ? YELLOW : 'rgba(255,255,255,.92)'; g.strokeStyle = INK; g.lineWidth = sel ? 2 : 1;
    roundRect(g, r.x, r.y, r.w, r.h, 5); g.fill(); g.stroke();
    g.fillStyle = INK; g.font = `700 12px ${FONT}`; g.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + .5);
  }
  for (const label of container.querySelectorAll('.mg-sea-label span')) {
    const r = rel(label), sea = label.parentElement.classList.contains('sea');
    g.font = `${sea ? 'italic ' : '600 '}${sea ? 15 : 11}px ${FONT}`; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)'; g.fillStyle = sea ? '#2a4fa8' : INK;
    g.strokeText(label.textContent, r.x + r.w / 2, r.y + r.h / 2); g.fillText(label.textContent, r.x + r.w / 2, r.y + r.h / 2);
  }

  // ---- frame: title, north arrow, legend, scale bar, credits ---------------------------------------------
  const X0 = crop.x, Y0 = crop.y, CW = crop.w, CH = crop.h, M = 14;
  const idx = INDEX[state.index];
  const real = state.mode === 'real';
  const yearText = state.landcover ? 'Lớp phủ đất 2021' : state.display === 'change' ? '2020 → 2025' : `Mùa khô ${state.year}`;
  const title = state.landcover ? 'TP.HCM · Lớp phủ đất (ESA WorldCover)' : `TP.HCM · ${idx.name} (${idx.code})`;
  const sub = [yearText, real && !state.landcover ? DISPLAY_TEXT[state.display] : null].filter(Boolean).join(' · ');

  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `800 16px ${FONT}`; const tw = g.measureText(title).width;
  g.font = `500 12px ${FONT}`; const sw = g.measureText(sub).width;
  const tcw = Math.min(CW - 2 * M - 60, Math.max(tw, sw) + 28);
  card(g, X0 + M, Y0 + M, tcw, datesText ? 66 : 52);
  g.fillStyle = INK; g.font = `800 16px ${FONT}`; g.fillText(title, X0 + M + 14, Y0 + M + 24);
  g.font = `500 12px ${FONT}`; g.fillText(sub, X0 + M + 14, Y0 + M + 42);
  if (datesText) { g.fillStyle = '#55544a'; g.font = `500 11px ${FONT}`; g.fillText(datesText, X0 + M + 14, Y0 + M + 58); }

  // north arrow
  const nx = X0 + CW - M - 18, ny = Y0 + M;
  card(g, nx - 4, ny, 40, 52);
  g.fillStyle = INK; g.beginPath(); g.moveTo(nx + 16, ny + 8); g.lineTo(nx + 26, ny + 32); g.lineTo(nx + 16, ny + 26); g.lineTo(nx + 6, ny + 32); g.closePath(); g.fill();
  g.textAlign = 'center'; g.font = `800 13px ${FONT}`; g.fillText('B', nx + 16, ny + 47);

  // credits strip
  const credit = ['Ảnh Landsat 8/9 (USGS), xử lý trên Google Earth Engine · Ranh giới 167 xã/phường: Vietnamese Provinces Database',
    BASE_CREDIT[state.basemap] || '', idx.key === 'tvdi' ? 'Độ khô là chỉ số thử nghiệm.' : idx.key === 'lst' ? 'Nhiệt độ bề mặt, không phải nhiệt độ không khí.' : '',
    `Xuất từ MobileGIS TP.HCM ngày ${new Date().toLocaleDateString('vi-VN')}`].filter(Boolean).join(' · ');
  g.font = `500 10.5px ${FONT}`; g.textAlign = 'left';
  const lines = wrap(g, credit, CW - 2 * M), ch = lines.length * 14 + 8;
  g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(X0, Y0 + CH - ch, CW, ch);
  g.fillStyle = INK; g.fillRect(X0, Y0 + CH - ch, CW, 1.5);
  g.fillStyle = '#33322b'; lines.forEach((l, i) => g.fillText(l, X0 + M, Y0 + CH - ch + 15 + i * 14));
  const floor = Y0 + CH - ch - 10;

  // scale bar (bottom right)
  const mid = map.containerPointToLatLng([W / 2, H / 2]), mid2 = map.containerPointToLatLng([W / 2 + 100, H / 2]);
  const perPx = mid.distanceTo(mid2) / 100, maxMeters = perPx * Math.min(150, CW * .3), meters = niceLength(maxMeters), px = meters / perPx;
  const label = meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
  const sbw = px + 28;
  card(g, X0 + CW - M - sbw, floor - 38, sbw, 38);
  g.fillStyle = INK; g.fillRect(X0 + CW - M - sbw + 14, floor - 14, px, 4);
  for (const t of [0, px]) g.fillRect(X0 + CW - M - sbw + 14 + t - 1, floor - 20, 2, 10);
  g.textAlign = 'center'; g.font = `700 11px ${FONT}`; g.fillText(label, X0 + CW - M - sbw / 2, floor - 24);

  // legend (bottom left)
  g.textAlign = 'left';
  const lx = X0 + M, barW = Math.min(250, CW - 2 * M - 28);
  let rows = [], colors = null, ends = null, note = '';
  if (state.landcover) note = 'Lớp phủ đất ESA WorldCover 2021 (lấy mẫu 120 m)';
  else if (state.display === 'change' && real) { colors = CHANGE_RAMP; ends = ['giảm', '0', 'tăng']; note = `Thay đổi ${idx.label.toLowerCase()} 2025 − 2020${idx.unit ? ' (' + idx.unit + ')' : ''}`; }
  else if (state.display === 'coverage' && real) { colors = COVERAGE_RAMP; ends = ['0%', '50%', '100%']; note = 'Tỷ lệ ô ảnh hợp lệ (không phải độ chính xác)'; }
  else { colors = idx.colors; ends = [`${idx.min}${idx.unit ? ' ' + idx.unit : ''}`, '', `${idx.max}${idx.unit ? ' ' + idx.unit : ''}`]; note = idx.name + (idx.experimental ? ' · thử nghiệm' : ''); }
  if (colors) rows = [note, 'bar'];
  else rows = [note];
  if (!state.landcover && state.index === 'tvdi' && colors === idx.colors) rows.push('Mức: ' + TVDI_CLASSES.map(c => c.name.toLowerCase()).join(' → '));
  if (real && !state.landcover && state.display === 'zones') rows.push('Xám nét đứt: dưới 50% độ phủ ảnh hợp lệ');
  else if (real && !state.landcover && state.display === 'raster') rows.push('Vùng không màu: thiếu dữ liệu, không phải 0');
  // wrap the note lines first so the card is tall enough for them
  g.font = `500 11px ${FONT}`;
  const items = rows.flatMap(row => row === 'bar' ? ['bar'] : wrap(g, row, barW).map((t, i) => ({t, head: row === note && i === 0 && !state.landcover || row === note && state.landcover})));
  const lh = 18 + items.reduce((n, r) => n + (r === 'bar' ? 34 : 16), 0);
  const ly = floor - lh;
  card(g, lx, ly, barW + 28, lh);
  let cy = ly + 22;
  for (const item of items) {
    if (item === 'bar') { gradientBar(g, lx + 14, cy - 8, barW, 12, colors); g.font = `600 11px ${FONT}`; g.fillStyle = INK;
      g.textAlign = 'left'; g.fillText(ends[0], lx + 14, cy + 20); g.textAlign = 'right'; g.fillText(ends.at(-1), lx + 14 + barW, cy + 20);
      if (ends.length === 3 && ends[1]) { g.textAlign = 'center'; g.fillText(ends[1], lx + 14 + barW / 2, cy + 20); }
      g.textAlign = 'left'; cy += 34; }
    else { g.fillStyle = INK; g.font = `${item.head ? '700 12px' : '500 11px'} ${FONT}`; g.fillText(item.t, lx + 14, cy); cy += 16; }
  }

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Trình duyệt không tạo được ảnh. Thử thu nhỏ cửa sổ rồi lưu lại.');
  const name = `mobilegis_${state.landcover ? 'lop-phu' : state.index}_${state.display === 'change' ? '2020-2025' : state.year}_${state.display}.png`;
  return {blob, name, missingBase};
}

export function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {href, download: name});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 4000);
}
export const datesRange = rows => {
  const all = [...new Set((rows || []).flatMap(r => r.dates || []))].sort();
  return all.length ? `Ảnh chụp ${all.length > 1 ? `${dmy(all[0])} – ${dmy(all.at(-1))}` : dmy(all[0])}` : '';
};
