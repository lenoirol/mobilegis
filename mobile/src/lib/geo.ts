/** Point-in-polygon for the commune boundaries (GeoJSON order is lng, lat; holes are respected). */
import type {Geo} from './data';

function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Code of the commune containing the point, or null when it is outside the 167 communes. */
export function communeAt(geo: Geo, lat: number, lng: number): string | null {
  for (const f of geo.features) {
    const g = f.geometry, polygons: number[][][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(hole => inRing(lng, lat, hole)))) return f.properties.code;
  }
  return null;
}
