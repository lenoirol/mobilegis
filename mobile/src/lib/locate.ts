/** Định vị GPS: lấy vị trí hiện tại (chỉ khi người dùng bấm nút, chỉ khi đang dùng app) và tìm xã/phường chứa điểm đó.
 *  Tọa độ chỉ dùng trên máy để tô điểm và chọn khu vực; không gửi đi, không lưu lại. */
import * as Location from 'expo-location';
import {bbox, getGeo} from './data';

export type Fix = {lon: number; lat: number; accuracy: number | null};
export type LocateResult = {ok: true; fix: Fix; code: string | null} | {ok: false; reason: 'denied' | 'off' | 'failed'; message: string};

/** Điểm có nằm trong một vòng (ray casting). */
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
/** Trong đa giác: trong vòng ngoài và không nằm trong lỗ. */
const inPolygon = (x: number, y: number, poly: number[][][]) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h));

/** Mã xã/phường chứa tọa độ, hoặc null nếu nằm ngoài 167 khu vực. */
export function wardAt(lon: number, lat: number): string | null {
  for (const f of getGeo().features) {
    const b = bbox.get(f.properties.code);
    if (b && (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3])) continue;
    const g = f.geometry, polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (polys.some(p => inPolygon(lon, lat, p))) return f.properties.code;
  }
  return null;
}

export async function locate(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted')
      return {ok: false, reason: 'denied', message: 'Bạn chưa cho phép ứng dụng dùng vị trí. Có thể bật lại trong Cài đặt → Ứng dụng → MobileGIS → Quyền → Vị trí.'};
    if (!(await Location.hasServicesEnabledAsync()))
      return {ok: false, reason: 'off', message: 'Định vị (GPS) của máy đang tắt. Hãy bật Vị trí trong thanh cài đặt nhanh rồi thử lại.'};
    // Lấy nhanh vị trí gần nhất nếu còn mới (dưới 30 giây), nếu không thì đo mới; giới hạn thời gian để máy yếu không bị treo.
    const last = await Location.getLastKnownPositionAsync({maxAge: 30000, requiredAccuracy: 200}).catch(() => null);
    const pos = last ?? await Promise.race([
      // Không đòi bật "Độ chính xác vị trí" của Google (người dùng có thể từ chối): đo thẳng bằng GPS của máy.
      Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false}),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    const fix = {lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy ?? null};
    return {ok: true, fix, code: wardAt(fix.lon, fix.lat)};
  } catch (e: any) {
    return {ok: false, reason: 'failed', message: e?.message === 'timeout' ? 'Chưa bắt được tín hiệu định vị sau 15 giây. Hãy ra chỗ thoáng hoặc thử lại.' : 'Không lấy được vị trí: ' + String(e?.message ?? e)};
  }
}
