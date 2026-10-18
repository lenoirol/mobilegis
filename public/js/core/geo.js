/* Point-in-polygon for the commune boundaries (GeoJSON order is lng, lat; holes are respected). */
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Code of the commune containing the point, or null when it is outside the 167 communes. */
export function communeAt(geo, lat, lng) {
  for (const f of geo.features) {
    const g = f.geometry, polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (polygons.some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some(hole => inRing(lng, lat, hole)))) return f.id;
  }
  return null;
}
