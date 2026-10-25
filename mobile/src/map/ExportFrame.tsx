import {forwardRef} from 'react';
import {Image, View} from 'react-native';
import {INDEX} from '@/lib/format';
import {BW, C, T} from '@/ds';
import {MapLegend} from './MapOverlays';
import type {MapView} from './MapCanvas';
import type {Dataset, Extras} from '@/lib/data';
import type {ViewBounds} from './Locator';

const NICE = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const BASE_CREDIT: Record<string, string> = {streets: 'Nền bản đồ © OpenStreetMap contributors', satellite: 'Nền ảnh: Esri, Maxar, Earthstar Geographics', plain: '', rgb2020: 'Ảnh màu Landsat 2020', rgb2025: 'Ảnh màu Landsat 2025'};

/** The picture saved by "Lưu ảnh bản đồ": the map as drawn on screen plus title, north arrow, scale bar, legend and credits (like the web export). */
export const ExportFrame = forwardRef<any, {uri: string; w: number; h: number; view: MapView; data: Dataset; extras: Extras | null; bounds: ViewBounds | null; onLoad: () => void}>(
  function ExportFrame({uri, w, h, view, data, extras, bounds, onLoad}, ref) {
    const idx = INDEX[view.index];
    const yearText = view.landcover ? 'Lớp phủ đất 2021' : view.display === 'change' ? '2020 → 2025' : `Mùa khô ${view.year}`;
    const title = view.landcover ? 'TP.HCM · Lớp phủ đất (ESA WorldCover)' : `TP.HCM · ${idx.name} (${idx.code})`;
    // Scale bar: metres across the picture at the middle latitude, then the nearest round length that fits in about a third of the width.
    let bar: {px: number; label: string} | null = null;
    if (bounds) {
      const midLat = (bounds.north + bounds.south) / 2, metres = Math.abs(bounds.east - bounds.west) * 111320 * Math.cos(midLat * Math.PI / 180);
      if (metres > 0) { const perPx = metres / w, want = perPx * w * 0.3, len = [...NICE].reverse().find(n => n <= want) ?? NICE[0]; bar = {px: len / perPx, label: len >= 1000 ? `${len / 1000} km` : `${len} m`}; }
    }
    const credit = ['Ảnh Landsat 8/9 (USGS), xử lý trên Google Earth Engine · Ranh giới 167 xã/phường: Vietnamese Provinces Database', BASE_CREDIT[view.basemap] ?? '',
      view.index === 'tvdi' ? 'Độ khô là chỉ số thử nghiệm.' : view.index === 'lst' ? 'Nhiệt độ bề mặt, không phải nhiệt độ không khí.' : '', `Xuất từ MobileGIS TP.HCM ngày ${new Date().toLocaleDateString('vi-VN')}`].filter(Boolean).join(' · ');
    return (
      <View ref={ref} collapsable={false} style={{width: w, backgroundColor: '#ffffff'}}>
        <View style={{width: w, height: h, backgroundColor: C.paper}}>
          <Image source={{uri}} style={{width: w, height: h}} resizeMode="cover" onLoad={onLoad} />
          <View style={{position: 'absolute', left: 12, top: 12, maxWidth: w - 84, backgroundColor: '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8}}>
            <T w={800} s={15}>{title}</T><T s={12} color={C.ink2}>{yearText}</T>
          </View>
          <View style={{position: 'absolute', right: 12, top: 12, width: 40, alignItems: 'center', backgroundColor: '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: 8, paddingVertical: 6}}>
            <T w={800} s={18} lh={1}>▲</T><T w={800} s={13}>B</T>
          </View>
          {bar && <View style={{position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,.92)', borderWidth: BW, borderColor: C.ink, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, gap: 3}}>
            <View style={{width: bar.px, height: 6, borderWidth: 1.5, borderColor: C.ink, borderTopWidth: 0}} /><T mono w={700} s={11}>{bar.label}</T>
          </View>}
        </View>
        <View style={{padding: 12, gap: 10, borderTopWidth: BW, borderColor: C.ink}}>
          <MapLegend view={view} data={data} extras={extras} open onToggle={() => {}} />
          <T s={10.5} lh={1.4} color={C.ink2}>{credit}</T>
        </View>
      </View>
    );
  });
