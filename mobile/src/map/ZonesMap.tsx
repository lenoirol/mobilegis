/** Bản đồ MapLibre dùng chung cho tab Bản đồ và tab Xếp hạng.
 *  Tối ưu cho máy yếu: ranh giới chỉ nạp MỘT lần; đổi chỉ số/năm/khu vực chỉ đổi biểu thức màu (không nạp lại dữ liệu);
 *  biểu thức màu của 18 tổ hợp chỉ số × năm được tính sẵn; chế độ nhẹ tắt khối 3D và hiệu ứng bay. */
import {forwardRef, memo, useImperativeHandle, useMemo, useRef} from 'react';
import {Camera, GeoJSONSource, Layer, Map, RasterSource, type CameraRef, type MapRef} from '@maplibre/maplibre-react-native';
import {ESRI_TILES, OSM_TILES} from '@/lib/config';
import {INDEX, NODATA, colorOf, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import {CODES, WORLD_BOX, bbox, getGeo, getRows, useDataVersion} from '@/lib/data';

export interface ZonesHandle {fitAll: () => void; focus: (code: string, wide?: boolean) => void; zoomBy: (d: number) => void; snapshot: () => Promise<string | null>}
interface Props {index: IndexKey; year: number; selected: string | null; dims?: '2d' | '3d'; basemap?: 'osm' | 'sat' | 'plain'; pixelTiles?: string | null;
  dimOthers?: boolean; lite?: boolean; onPick: (code: string | null) => void; padding?: {top: number; right: number; bottom: number; left: number}}

const STYLE = {version: 8 as const, sources: {}, layers: [{id: 'bg', type: 'background' as const, paint: {'background-color': '#e3eaf0'}}]};
const vis = (on: boolean) => ({visibility: on ? 'visible' : 'none'} as const);

/** Biểu thức màu ['match', code, ...] cho một chỉ số và một năm (khu vực chưa đủ dữ liệu: xám). */
function colourExpr(k: IndexKey, year: number) {
  const rows = getRows(), e: any[] = ['match', ['get', 'code']];
  for (const code of CODES) { const r = rows.get(code, year); e.push(code, eligible(r, k) ? colorOf(r![k], k) : NODATA); }
  e.push(NODATA); return e;
}
function heightExpr(k: IndexKey, year: number) {
  const rows = getRows(), s = INDEX[k], e: any[] = ['match', ['get', 'code']];
  for (const code of CODES) { const r = rows.get(code, year); e.push(code, eligible(r, k) ? Math.max(200, ((r![k]! - s.min) / (s.max - s.min)) * 9000) : 0); }
  e.push(0); return e;
}

export const ZonesMap = memo(forwardRef<ZonesHandle, Props>(function ZonesMap({index, year, selected, dims = '2d', basemap = 'osm', pixelTiles, dimOthers, lite, onPick, padding}, ref) {
  const camera = useRef<CameraRef>(null), map = useRef<MapRef>(null);
  const version = useDataVersion();
  const pad = padding ?? {top: 40, right: 20, bottom: 40, left: 20};
  const fill = useMemo(() => colourExpr(index, year), [index, year, version]);
  const height = useMemo(() => dims === '3d' ? heightExpr(index, year) : 0, [index, year, dims, lite, version]);
  const sel = selected ?? '';
  const anim = lite ? 0 : 650;
  useImperativeHandle(ref, () => ({
    fitAll: () => camera.current?.fitBounds(WORLD_BOX, {padding: pad, duration: anim, pitch: dims === '3d' ? 45 : 0}),
    focus: (code, wide) => {
      const b = bbox.get(code); if (!b) return;
      const dx = (b[2] - b[0]) * (wide ? 2.5 : 0.6), dy = (b[3] - b[1]) * (wide ? 2.5 : 0.6);
      camera.current?.fitBounds([b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy], {padding: pad, duration: anim});
    },
    zoomBy: async d => { const z = await map.current?.getZoom(); if (z != null) camera.current?.zoomTo(z + d, {duration: lite ? 0 : 200}); },
    snapshot: async () => { try { return await (map.current as any)?.createStaticMapImage({output: 'file'}) ?? null; } catch { return null; } },
  }), [pad, anim, dims, lite]);
  const extrude = dims === '3d' && !pixelTiles;
  const laidOut = useRef('');
  /** Khung bản đồ thay đổi kích thước (lúc mở tab) thì căn lại toàn vùng một lần, kẻo hình bị nhỏ/lệch. */
  const fitOnce = (e: any) => { const {width, height} = e.nativeEvent.layout, key = Math.round(width) + 'x' + Math.round(height); if (laidOut.current === key) return; laidOut.current = key; setTimeout(() => camera.current?.fitBounds(WORLD_BOX, {padding: pad, duration: 0}), 60); };
  return (
    <Map ref={map} style={{flex: 1}} mapStyle={STYLE} logo={false} compass={false} attributionPosition={{bottom: 4, right: 4}} touchPitch={!lite} touchRotate={!lite}
      preferredFramesPerSecond={lite ? 30 : 60} onLayout={fitOnce}>
      <Camera ref={camera} initialViewState={{bounds: WORLD_BOX, padding: pad}} minZoom={6} maxZoom={16} pitch={extrude ? 45 : 0} duration={anim} />
      <RasterSource id="osm" tiles={[OSM_TILES]} tileSize={256} maxzoom={18} attribution="Bản đồ nền: Esri, HERE, Garmin, OpenStreetMap"><Layer id="osm-l" type="raster" layout={vis(basemap === 'osm')} /></RasterSource>
      <RasterSource id="sat" tiles={[ESRI_TILES]} tileSize={256} maxzoom={17} attribution="Ảnh: Esri"><Layer id="sat-l" type="raster" layout={vis(basemap === 'sat')} /></RasterSource>
      {pixelTiles ? <RasterSource key={pixelTiles} id="px" tiles={[pixelTiles]} tileSize={256} maxzoom={13}><Layer id="px-l" type="raster" paint={{'raster-opacity': 0.92}} /></RasterSource> : null}
      <GeoJSONSource id="zones" data={getGeo() as any} onPress={(e: any) => { const f = e.nativeEvent?.features?.[0]; onPick(f?.properties?.code ?? null); }}>
        <Layer id="z-fill" type="fill" layout={vis(!pixelTiles && !extrude)}
          paint={{'fill-color': fill as any, 'fill-opacity': dimOthers && sel ? ['case', ['==', ['get', 'code'], sel], 0.95, 0.18] as any : 0.86}} />
        <Layer id="z-3d" type="fill-extrusion" layout={vis(extrude)}
          paint={{'fill-extrusion-color': fill as any, 'fill-extrusion-height': height as any, 'fill-extrusion-opacity': 0.9}} />
        <Layer id="z-line" type="line" paint={{'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': dimOthers && sel ? 0.4 : 0.9}} />
        <Layer id="z-sel" type="line" filter={['==', ['get', 'code'], sel] as any} paint={{'line-color': '#1d2733', 'line-width': 3}} />
      </GeoJSONSource>
    </Map>
  );
}));
