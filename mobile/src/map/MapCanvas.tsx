import {forwardRef, memo, useImperativeHandle, useMemo, useRef} from 'react';
import {Camera, GeoJSONSource, Layer, Map, RasterSource, type CameraRef} from '@maplibre/maplibre-react-native';
import {API_BASE, OSM_ATTRIBUTION, OSM_TILES, START_CENTER, START_ZOOM} from '@/lib/config';
import {INDICES, valid, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import type {Dataset, Extras, RowIndex, TileMeta} from '@/lib/data';
import {coverageColor, NODATA, valueColor} from './colors';
import {C} from '@/ds/tokens';

export type Display = 'raster' | 'zones' | 'change' | 'coverage';
export type Basemap = 'streets' | 'satellite' | 'plain' | 'rgb2020' | 'rgb2025';
export interface MapView {index: IndexKey; year: number; display: Display; basemap: Basemap; boundaries: boolean; labels: boolean; landcover: boolean; opacity: number; visible: boolean; selected: string | null}
export interface MapHandle {flyTo: (lng: number, lat: number, zoom?: number) => void; fitAll: () => void; fitBox: (box: [number, number, number, number]) => void}
interface Props {data: Dataset; rows: RowIndex; extras: Extras | null; view: MapView; me: {lat: number; lng: number} | null; probe: {lat: number; lng: number} | null; onTap: (lng: number, lat: number) => void; onIdle?: () => void; onRegion?: (b: {west: number; south: number; east: number; north: number}) => void; transparent?: boolean}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STYLE = {version: 8 as const, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources: {}, layers: [{id: 'bg', type: 'background' as const, paint: {'background-color': '#dde6f3'}}]};
const CLEAR_STYLE = {version: 8 as const, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources: {}, layers: [] as any[]};
const SEA = {type: 'FeatureCollection' as const, features: [
  {type: 'Feature' as const, properties: {text: 'QĐ. Hoàng Sa (Việt Nam)', kind: 'isl'}, geometry: {type: 'Point' as const, coordinates: [112.0, 16.5]}},
  {type: 'Feature' as const, properties: {text: 'QĐ. Trường Sa (Việt Nam)', kind: 'isl'}, geometry: {type: 'Point' as const, coordinates: [114.2, 10.0]}},
  {type: 'Feature' as const, properties: {text: 'Biển Đông', kind: 'sea'}, geometry: {type: 'Point' as const, coordinates: [113.2, 13.6]}},
]};
const vis = (on: boolean) => ({visibility: on ? 'visible' : 'none'} as const);
const tileUrl = (m: TileMeta) => `${API_BASE}${m.url}?style=pg3`;
const point = (lng: number, lat: number) => ({type: 'Feature' as const, properties: {}, geometry: {type: 'Point' as const, coordinates: [lng, lat]}});

function Raster({id, meta, visible, opacity}: {id: string; meta: TileMeta; visible: boolean; opacity: number}) {
  return (
    <RasterSource id={id} tiles={[tileUrl(meta)]} tileSize={256} minzoom={meta.min_zoom} maxzoom={meta.max_native_zoom}>
      <Layer id={id + '-l'} type="raster" layout={vis(visible)} paint={{'raster-opacity': opacity, 'raster-fade-duration': 150}} />
    </RasterSource>
  );
}

/** The MapLibre scene. Every layer is mounted once and only toggled (visibility/opacity), so switching year, index or basemap never reorders layers. */
export const MapCanvas = memo(forwardRef<MapHandle, Props>(function MapCanvas({data, rows, extras, view, me, probe, onTap, onIdle, onRegion, transparent}, ref) {
  const camera = useRef<CameraRef>(null);
  const {geo, products} = data;
  const box = useMemo(() => { let w = 180, s = 90, e = -180, n = -90; const walk = (c: any): void => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); }; geo.features.forEach(f => walk(f.geometry.coordinates)); return [w, s, e, n] as [number, number, number, number]; }, [geo]);
  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 11) => { camera.current?.flyTo({center: [lng, lat], zoom, duration: 700}); },
    fitAll: () => { camera.current?.fitBounds(box, {padding: {top: 90, right: 24, bottom: 300, left: 24}, duration: 700}); },
    fitBox: b => { camera.current?.fitBounds(b, {padding: {top: 120, right: 40, bottom: 320, left: 40}, duration: 800}); },
  }), [box]);

  const {index, year, display, basemap, landcover, visible, selected} = view;
  const fillMode = visible && !landcover && (display === 'zones' || display === 'coverage');
  const rasterOn = visible && !landcover;
  // Zone colours: eligible areas get the scale colour, the rest grey (dashed outline). Coverage mode paints the sample coverage instead.
  const {fill, lowCodes} = useMemo(() => {
    const expr: any[] = ['match', ['get', 'code']]; const low: string[] = [];
    for (const f of geo.features) {
      const code = f.properties.code, row = rows.get(code, year);
      const colour = display === 'coverage' ? coverageColor(row?.[`${index}_coverage` as const]) : eligible(row, index) ? valueColor(row![index], index) : NODATA;
      if (display !== 'coverage' && !eligible(row, index)) low.push(code);
      expr.push(code, colour);
    }
    expr.push(NODATA);
    return {fill: expr, lowCodes: low};
  }, [geo, rows, year, index, display]);
  const labelPoints = useMemo(() => ({type: 'FeatureCollection' as const, features: geo.features.map(f => ({type: 'Feature' as const, properties: {code: f.properties.code, name: f.properties.name}, geometry: {type: 'Point' as const, coordinates: [f.properties.lon, f.properties.lat]}}))}), [geo]);

  const abs = useMemo(() => Object.entries(products.absolute).flatMap(([y, byIdx]) => INDICES.filter(k => byIdx[k]).map(k => ({y: +y, k, meta: byIdx[k]!}))), [products]);
  return (
    <Map style={{flex: 1}} mapStyle={transparent ? CLEAR_STYLE : STYLE} logo={false} compass={false} attributionPosition={{bottom: 6, left: 6}} onPress={(e: any) => { const [lng, lat] = e.nativeEvent.lngLat; onTap(lng, lat); }}
      onDidFinishRenderingMapFully={() => onIdle?.()} onRegionDidChange={(e: any) => { const b = e.nativeEvent?.bounds; if (Array.isArray(b) && b.length === 4) onRegion?.({west: b[0], south: b[1], east: b[2], north: b[3]}); }}>
      <Camera ref={camera} initialViewState={{center: START_CENTER, zoom: START_ZOOM}} />
      {!transparent && <>
        <RasterSource id="osm" tiles={[OSM_TILES]} tileSize={256} maxzoom={19} attribution={OSM_ATTRIBUTION}><Layer id="osm-l" type="raster" layout={vis(basemap === 'streets')} /></RasterSource>
        <RasterSource id="esri" tiles={[ESRI]} tileSize={256} maxzoom={18} attribution="Ảnh: Esri, Maxar, Earthstar Geographics"><Layer id="esri-l" type="raster" layout={vis(basemap === 'satellite')} /></RasterSource>
        {extras?.world && (
          <GeoJSONSource id="world" data={extras.world}>
            <Layer id="world-fill" type="fill" layout={vis(basemap === 'plain')} paint={{'fill-color': ['match', ['get', 'kind'], 'vn', '#fff3b0', '#fffdf6']}} />
            <Layer id="world-line" type="line" layout={vis(basemap === 'plain')} paint={{'line-color': '#0e0e0c', 'line-width': 0.8, 'line-opacity': 0.55}} />
          </GeoJSONSource>
        )}
        {extras?.context.rgb_2020 && <Raster id="rgb2020" meta={extras.context.rgb_2020} visible={basemap === 'rgb2020'} opacity={1} />}
        {extras?.context.rgb_2025 && <Raster id="rgb2025" meta={extras.context.rgb_2025} visible={basemap === 'rgb2025'} opacity={1} />}
      </>}
      {extras?.context.worldcover && <Raster id="landcover" meta={extras.context.worldcover} visible={visible && landcover} opacity={view.opacity} />}
      {abs.map(a => <Raster key={`${a.y}-${a.k}`} id={`abs-${a.y}-${a.k}`} meta={a.meta} visible={rasterOn && display === 'raster' && a.y === year && a.k === index} opacity={view.opacity} />)}
      {INDICES.map(k => products.change[k] ? <Raster key={'chg' + k} id={`chg-${k}`} meta={products.change[k]!} visible={rasterOn && display === 'change' && k === index} opacity={view.opacity} /> : null)}
      <GeoJSONSource id="communes" data={geo as any}>
        <Layer id="zone-fill" type="fill" layout={vis(fillMode)} paint={{'fill-color': fill as any, 'fill-opacity': view.opacity * 0.92}} />
        <Layer id="zone-line" type="line" layout={vis(view.boundaries)} paint={{'line-color': '#4b4a3c', 'line-width': 0.8}} />
        <Layer id="zone-low" type="line" layout={vis(fillMode && view.boundaries)} filter={['in', ['get', 'code'], ['literal', lowCodes]] as any} paint={{'line-color': '#4b4a3c', 'line-width': 1.4, 'line-dasharray': [2, 2]}} />
        <Layer id="zone-sel" type="line" filter={['==', ['get', 'code'], selected ?? ''] as any} paint={{'line-color': C.ink, 'line-width': 3.2}} />
      </GeoJSONSource>
      <GeoJSONSource id="labels" data={labelPoints as any}>
        <Layer id="label-text" type="symbol" minzoom={10.5} layout={{...vis(view.labels && view.boundaries), 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-padding': 6, 'symbol-sort-key': ['case', ['==', ['get', 'code'], selected ?? ''], 0, 1]} as any} paint={{'text-color': C.ink, 'text-halo-color': '#ffffff', 'text-halo-width': 2}} />
      </GeoJSONSource>
      <GeoJSONSource id="sea" data={SEA as any}>
        <Layer id="sea-text" type="symbol" maxzoom={9.5} layout={{'text-field': ['get', 'text'], 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-letter-spacing': 0.08} as any} paint={{'text-color': ['match', ['get', 'kind'], 'sea', '#3b5b8a', '#0e0e0c'] as any, 'text-halo-color': '#ffffffcc', 'text-halo-width': 1.5}} />
      </GeoJSONSource>
      {probe && <GeoJSONSource id="probe" data={point(probe.lng, probe.lat) as any}>
        <Layer id="probe-halo" type="circle" paint={{'circle-radius': 12, 'circle-color': C.signal, 'circle-opacity': 0.45, 'circle-stroke-color': C.ink, 'circle-stroke-width': 1.5}} />
        <Layer id="probe-dot" type="circle" paint={{'circle-radius': 4, 'circle-color': C.ink}} />
      </GeoJSONSource>}
      {me && <GeoJSONSource id="me" data={point(me.lng, me.lat) as any}>
        <Layer id="me-halo" type="circle" paint={{'circle-radius': 16, 'circle-color': '#1b5fd1', 'circle-opacity': 0.2}} />
        <Layer id="me-dot" type="circle" paint={{'circle-radius': 6.5, 'circle-color': '#1b5fd1', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5}} />
      </GeoJSONSource>}
    </Map>
  );
}));
