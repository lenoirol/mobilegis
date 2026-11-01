/* "Lưu ảnh bản đồ": a print-style PNG of the current view with title, coordinate ticks (2D only), north arrow,
   scale bar, colour scale and data source, laid out like a thematic map sheet. */
import {INDEX, fmt} from '../core/format.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const INK = '#1d2733', INK3 = '#5d6b7c';

function niceStep(span, target = 4) {
  const raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => raw <= s) || 10 * mag;
}
const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60); return `${m === 60 ? d + 1 : d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′${v >= 0 ? pos : neg}`; };
function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371008.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function exportMap(map, s, {title}) {
  await new Promise(resolve => { if (map.loaded() && map.areTilesLoaded()) resolve(); else map.once('idle', resolve); });
  const src = await new Promise(resolve => { map.once('render', () => resolve(map.getCanvas())); map.triggerRepaint(); });
  const dpr = src.width / map.getCanvas().clientWidth, W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight;
  const M = {l: 70, r: 30, t: 78, b: 130}, out = document.createElement('canvas');
  out.width = Math.round((W + M.l + M.r) * dpr); out.height = Math.round((H + M.t + M.b) * dpr);
  const g = out.getContext('2d'); g.scale(dpr, dpr);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W + M.l + M.r, H + M.t + M.b);
  const spec = INDEX[s.index], flat = map.getPitch() < 0.5;

  // title
  g.fillStyle = INK; g.textAlign = 'center'; g.font = `700 22px ${FONT}`;
  g.fillText(title, M.l + W / 2, 34);
  g.font = `14px ${FONT}`; g.fillStyle = INK3;
  g.fillText(`${spec.name} (${spec.code}${spec.unit ? ', ' + spec.unit : ''}) · mùa khô ${s.year} · ${s.mode === 'pixel' ? 'ô ảnh 120 m' : 'trung bình theo xã/phường'}${s.dims === '3d' && s.mode !== 'pixel' ? ' · phối cảnh 3D' : ''}`, M.l + W / 2, 58);

  // map + frame
  g.drawImage(src, 0, 0, src.width, src.height, M.l, M.t, W, H);
  g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(M.l, M.t, W, H);

  // coordinate ticks (only meaningful for a flat, north-up view)
  g.font = `11px ${FONT}`; g.fillStyle = INK; g.lineWidth = 1;
  if (flat && Math.abs(map.getBearing()) < 0.5) {
    const sw = map.unproject([0, H]), ne = map.unproject([W, 0]);
    const sx = niceStep(ne.lng - sw.lng), sy = niceStep(ne.lat - sw.lat);
    g.textAlign = 'center';
    for (let lng = Math.ceil(sw.lng / sx) * sx; lng <= ne.lng; lng += sx) {
      const x = M.l + map.project([lng, (sw.lat + ne.lat) / 2]).x;
      g.beginPath(); g.moveTo(x, M.t + H); g.lineTo(x, M.t + H + 6); g.moveTo(x, M.t); g.lineTo(x, M.t - 6); g.stroke();
      g.fillText(dms(lng, 'E', 'W'), x, M.t + H + 18);
    }
    g.save(); g.textAlign = 'center';
    for (let lat = Math.ceil(sw.lat / sy) * sy; lat <= ne.lat; lat += sy) {
      const y = M.t + map.project([(sw.lng + ne.lng) / 2, lat]).y;
      g.beginPath(); g.moveTo(M.l, y); g.lineTo(M.l - 6, y); g.moveTo(M.l + W, y); g.lineTo(M.l + W + 6, y); g.stroke();
      g.save(); g.translate(M.l - 12, y); g.rotate(-Math.PI / 2); g.fillText(dms(lat, 'N', 'S'), 0, 0); g.restore();
    }
    g.restore();
  } else {
    g.textAlign = 'left'; g.fillStyle = INK3;
    g.fillText('Phối cảnh nghiêng/xoay: không vẽ lưới tọa độ để tránh sai lệch.', M.l, M.t + H + 18);
  }

  // north arrow (rotated with the map bearing)
  const nx = M.l + W - 34, ny = M.t + 44;
  g.save(); g.translate(nx, ny); g.rotate(-map.getBearing() * Math.PI / 180);
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.moveTo(0, -18); g.lineTo(8, 10); g.lineTo(0, 4); g.lineTo(-8, 10); g.closePath(); g.fill();
  g.font = `700 12px ${FONT}`; g.textAlign = 'center'; g.fillText('B', 0, -20 + 0); g.restore();

  // scale bar (at the map centre; omitted in 3D perspective where scale varies across the view)
  const by = M.t + H + 44;
  if (flat) {
    const c = [W / 2, H / 2], m100 = haversine(map.unproject(c).toArray(), map.unproject([c[0] + 100, c[1]]).toArray());
    const nice = [500, 1000, 2000, 5000, 10000, 20000, 25000, 50000].reduce((best, d) => Math.abs(d / m100 * 100 - 160) < Math.abs(best / m100 * 100 - 160) ? d : best);
    const len = nice / m100 * 100, x0 = M.l;
    g.fillStyle = INK; g.fillRect(x0, by, len / 2, 6); g.strokeStyle = INK; g.strokeRect(x0, by, len, 6);
    g.font = `11px ${FONT}`; g.textAlign = 'center';
    [[0, '0'], [len / 2, String(nice / 2000)], [len, `${nice / 1000} km`]].forEach(([dx, t]) => g.fillText(t, x0 + dx, by + 20));
  }

  // colour scale
  const lx = M.l + W - 300, lw = 300;
  const grad = g.createLinearGradient(lx, 0, lx + lw, 0);
  spec.colors.forEach((c, i) => grad.addColorStop(i / (spec.colors.length - 1), c));
  g.fillStyle = grad; g.fillRect(lx, by, lw, 12); g.strokeStyle = INK3; g.strokeRect(lx, by, lw, 12);
  g.fillStyle = INK; g.font = `11px ${FONT}`; g.textAlign = 'left'; g.fillText(fmt(spec.min, spec.digits === 1 ? 0 : 1), lx, by + 26);
  g.textAlign = 'right'; g.fillText(fmt(spec.max, spec.digits === 1 ? 0 : 1), lx + lw, by + 26);
  g.textAlign = 'center'; g.fillText(`${spec.code}${spec.unit ? ' (' + spec.unit + ')' : ''}${spec.experimental ? ' · thử nghiệm' : ''}`, lx + lw / 2, by + 26);
  if (s.mode !== 'pixel') { g.fillStyle = '#c3ccd5'; g.fillRect(lx, by + 34, 14, 10); g.fillStyle = INK3; g.textAlign = 'left'; g.fillText('Chưa đủ dữ liệu (độ phủ mẫu < 50%)', lx + 20, by + 43); }

  // source
  g.fillStyle = INK3; g.font = `11px ${FONT}`; g.textAlign = 'left';
  g.fillText('Nguồn: Landsat 8/9 Collection 2 Level-2 (USGS), xử lý trên Google Earth Engine; ranh giới 167 xã/phường TP.HCM sau sáp nhập (không gồm Côn Đảo).', M.l, M.t + H + M.b - 30);
  g.fillText(`Nền: ${s.basemap === 'sat' ? 'Esri World Imagery' : s.basemap === 'plain' ? 'Natural Earth' : '© OpenStreetMap'} · Xuất ngày ${new Date().toLocaleDateString('vi-VN')} · Bản đồ Nhiệt - Xanh - Khô TP.HCM`, M.l, M.t + H + M.b - 14);

  return new Promise(resolve => out.toBlob(resolve, 'image/png'));
}
