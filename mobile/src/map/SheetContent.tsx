import {useEffect, useRef, useState} from 'react';
import {Animated, Linking, Pressable, View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import {Button, Callout, CheckMark, Field, Input, PressBox, Segmented, Slider, T, Tag, C, BW, RADIUS, Eyebrow} from '@/ds';
import {EASE_SPRING} from '@/ds/motion';
import {INDEX, INDICES, TVDI_ALERT, YEARS, confidence, dmy, fmt, pct, shortName, tvdiClass, valid, type IndexKey} from '@/lib/format';
import {quality, eligible} from '@/lib/policy';
import {areaSentence} from '@/lib/insight';
import {API_BASE} from '@/lib/config';
import type {CoverRow, Dataset, RowIndex} from '@/lib/data';
import {TrendChart} from '@/components/TrendChart';
import {CountUp} from '@/components/CountUp';
import type {Basemap, Display, MapView} from './MapCanvas';

export interface Probe {lat: number; lng: number; loading?: boolean; value?: number | null; change?: boolean; unavailable?: boolean; error?: string}
interface Props {
  data: Dataset; rows: RowIndex; cover: CoverRow[]; view: MapView; probe: Probe | null; playing: boolean; pinned: string[]; fromCache: boolean; rowsFrom: string; canChange: boolean; canCompare: boolean; compare: boolean;
  notes: Record<string, string>;
  onIndex: (k: IndexKey) => void; onYear: (y: number) => void; onPlay: () => void; onPick: (code: string) => void; onPatch: (p: Partial<MapView> & {compare?: boolean}) => void; onPin: () => void; onTable: () => void;
}

const DISPLAYS: {value: Display; label: string}[] = [{value: 'raster', label: 'Chi tiết'}, {value: 'zones', label: 'Xã/phường'}, {value: 'change', label: 'Thay đổi'}, {value: 'coverage', label: 'Độ tin cậy'}];
const DISPLAY_HINT: Record<Display, string> = {
  raster: 'Mỗi ô 120 m một màu. Vùng không màu là thiếu mẫu hợp lệ (mây, mất dữ liệu), không phải giá trị 0.',
  zones: 'Trung bình các ô hợp lệ của từng xã/phường. Xám nét đứt: thiếu hoặc độ phủ dưới 50%, không tô theo số ít mẫu.',
  change: 'Giá trị 2025 trừ 2020, chỉ ở ô hợp lệ cả hai năm. Khác với hiệu hai trung bình khu vực.',
  coverage: 'Tỷ lệ phần ảnh dùng được của từng khu vực. Đây là mức đầy đủ của dữ liệu, không phải độ chính xác.',
};
const BASES: {value: Basemap; label: string}[] = [{value: 'streets', label: 'Bản đồ'}, {value: 'satellite', label: 'Vệ tinh'}, {value: 'plain', label: 'Nhẹ'}, {value: 'rgb2020', label: 'Ảnh 2020'}, {value: 'rgb2025', label: 'Ảnh 2025'}];
const BASE_NOTE: Record<Basemap, string> = {
  plain: 'Nền nhẹ: số liệu và ranh giới nằm trên máy, không cần Internet.',
  satellite: 'Ảnh vệ tinh thế giới (Esri) · cần Internet. Chỉ là ảnh, không có ranh giới quốc gia.',
  streets: 'Bản đồ thế giới OpenStreetMap · cần Internet. Thu nhỏ để xem toàn cầu.',
  rgb2020: 'Ảnh nghiên cứu màu tự nhiên của bộ xử lý cũ, dùng làm bối cảnh. Vùng trống là pixel đã bị loại.',
  rgb2025: 'Ảnh nghiên cứu màu tự nhiên của bộ xử lý cũ, dùng làm bối cảnh. Vùng trống là pixel đã bị loại.',
};
export const rasterLink = (v: MapView) => v.landcover ? '/api/gee/rasters/worldcover_2021_10m.tif' : v.display === 'change' ? `/api/gee_recovery/rasters/change_${v.index}_2020_2025_120m.tif` : v.year === 2025 ? '/api/gee_recovery/rasters/indices_2025_recovery_batch1_120m.tif' : `/api/gee/rasters/indices_${v.year}_120m.tif`;

const Title = ({children}: {children: string}) => <T mono w={700} s={11} ls={0.14} upper color={C.ink2} style={{marginTop: 6}}>{children}</T>;
const Help = ({children}: {children: string}) => <T s={12} lh={1.45} color={C.ink3}>{children}</T>;

function Metric({k, view, row, onPress}: {k: IndexKey; view: MapView; row: any; onPress: () => void}) {
  const spec = INDEX[k], q = quality(row, k), conf = confidence(row?.[`${k}_coverage`]), cls = k === 'tvdi' ? tvdiClass(row?.tvdi) : null, active = view.index === k;
  return (
    <PressBox onPress={onPress} accessibilityRole="button" accessibilityState={{selected: active}} accessibilityLabel={`Hiện lớp ${spec.label}`} bg={active ? C.signal : C.card} shadow={active ? 4 : 2} fill style={{flex: 1}} innerStyle={{padding: 9, gap: 3, borderStyle: q === 'adequate' || q === 'missing' ? 'solid' : 'dashed'}}>
      <T mono w={700} s={10.5} color={C.ink2} numberOfLines={1}>{spec.label + (spec.experimental ? ' *' : '')}</T>
      <CountUp value={row?.[k]} format={v => fmt(v, spec.digits)} mono w={800} s={25} />
      <T s={11} color={C.ink2} style={{minHeight: 14}} numberOfLines={1}>{k === 'tvdi' ? (cls ? `Mức: ${cls.name.toLowerCase()}` : ' ') : spec.unit || ' '}</T>
      <Tag tone={q === 'adequate' ? (conf.key === 'high' ? 'ok' : 'low') : q === 'missing' ? 'missing' : 'sparse'}>{q === 'adequate' ? `Tin cậy ${conf.text.toLowerCase()}` : q === 'missing' ? 'Thiếu' : 'Tin cậy thấp'}</Tag>
    </PressBox>
  );
}

function YearRow({view, canPlay, playing, onYear, onPlay}: {view: MapView; canPlay: boolean; playing: boolean; onYear: (y: number) => void; onPlay: () => void}) {
  const bump = useRef(new Animated.Value(1)).current;
  useEffect(() => { bump.setValue(0.82); Animated.timing(bump, {toValue: 1, duration: 360, easing: EASE_SPRING, useNativeDriver: true}).start(); }, [view.year, view.display, view.landcover]);   // eslint-disable-line react-hooks/exhaustive-deps
  const locked = view.display === 'change' || view.landcover;
  const label = view.landcover ? '2021' : view.display === 'change' ? '2020→2025' : String(view.year);
  return (
    <View style={{gap: 6}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
        <Animated.View style={{transform: [{scale: bump}]}}><T mono w={800} s={view.display === 'change' ? 26 : 36} ls={-0.04}>{label}</T></Animated.View>
        <View style={{paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5, borderColor: C.ink, borderRadius: 5, backgroundColor: C.signal}}><T mono w={700} s={11} upper>{view.landcover ? 'Lớp phủ' : view.display === 'change' ? 'Hai mốc' : 'Mốc ảnh'}</T></View>
        <View style={{marginLeft: 'auto'}}><Button sm icon={playing ? 'pause' : 'play'} label={playing ? 'Tạm dừng' : 'Phát'} onPress={onPlay} disabled={!canPlay || locked} /></View>
      </View>
      <Slider min={YEARS[0]} max={YEARS.at(-1)!} value={view.year} onChange={onYear} disabled={locked} label="Mốc năm" />
      <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4}}>{YEARS.map(y => <T key={y} mono w={y === view.year ? 800 : 500} s={11} color={y === view.year ? C.ink : C.ink3}>{String(y)}</T>)}</View>
    </View>
  );
}

function Search({data, onPick}: {data: Dataset; onPick: (code: string) => void}) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const list = data.geo.features.filter(f => !q.trim() || norm(f.properties.full_name + ' ' + f.properties.code).includes(norm(q.trim())));
  const shown = q.trim() ? list.slice(0, 12) : [];
  return (
    <View style={{gap: 6}}>
      <Input value={q} onChangeText={setQ} placeholder="Nhập tên xã/phường…" accessibilityLabel="Tìm xã/phường hoặc mã hành chính" autoCorrect={false} returnKeyType="search" />
      {shown.length > 0 && (
        <View style={{borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: '#fff'}}>
          {shown.map((f, i) => (
            <Pressable key={f.properties.code} onPress={() => { setQ(''); onPick(f.properties.code); }} accessibilityRole="button" style={({pressed}) => ({paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: i ? 1.5 : 0, borderTopColor: C.hair, backgroundColor: pressed ? C.signal : '#fff', flexDirection: 'row', justifyContent: 'space-between'})}>
              <T w={700} s={15}>{f.properties.full_name}</T><T mono s={12} color={C.ink3}>{f.properties.code}</T>
            </Pressable>
          ))}
        </View>
      )}
      {q.trim() !== '' && shown.length === 0 && <T s={13} color={C.ink3}>Không tìm thấy khu vực.</T>}
      {list.length > 12 && <T s={12} color={C.ink3}>{`${list.length} khu vực · gõ thêm để lọc`}</T>}
    </View>
  );
}

function LandCover({row}: {row?: CoverRow}) {
  if (!row) return null;
  const classes = [...row.classes].filter(c => c.percent > 0).sort((a, b) => b.percent - a.percent);
  let x = 0;
  return (
    <View style={{gap: 6}}>
      <Title>Lớp phủ đất 2021 · mẫu ESA</Title>
      <Svg height={14} width="100%" viewBox="0 0 100 14" preserveAspectRatio="none">{classes.map(c => { const w = c.percent; const r = <Rect key={c.code} x={x} y={0} width={Math.max(0, w - 0.4)} height={14} fill={c.color} />; x += w; return r; })}</Svg>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4}}>{classes.slice(0, 3).map(c => <View key={c.code} style={{flexDirection: 'row', alignItems: 'center', gap: 5}}><View style={{width: 10, height: 10, backgroundColor: c.color, borderWidth: 1, borderColor: C.ink}} /><T s={12.5}>{`${c.name} ${fmt(c.percent, 1)}%`}</T></View>)}</View>
      <Help>Tỷ lệ trong các ô mẫu có phân loại; không phải diện tích địa chính.</Help>
    </View>
  );
}

export function SheetContent(p: Props) {
  const {view, rows, data} = p;
  const feature = data.geo.features.find(f => f.properties.code === view.selected) ?? null;
  const row = feature ? rows.get(feature.properties.code, view.year) : undefined;
  const q = quality(row, view.index), cov = row?.[`${view.index}_coverage` as const];
  const hot = !!feature && eligible(row, 'tvdi') && (row!.tvdi as number) >= TVDI_ALERT;
  const [more, setMore] = useState(false);
  const tech = !feature ? '' : q === 'adequate' ? `Độ phủ mẫu ${pct(cov, 1)} (${row?.[`${view.index}_pixels` as const]?.toLocaleString('vi-VN')} / ${row?.sampled_pixels?.toLocaleString('vi-VN')} ô ảnh hợp lệ): trung bình phần có mẫu, không phải độ chính xác.`
    : q === 'limited' ? `Độ phủ mẫu chỉ ${pct(cov, 1)}: giá trị mô tả phần có mẫu, chưa đại diện cả khu vực.` : q === 'unknown' ? 'Chưa xác định được độ phủ nên chưa nên so sánh với khu vực khác.' : 'Chưa có giá trị hợp lệ ở mốc này. Vùng trống không phải 0.';
  let delta = '';
  if (view.display === 'change' && feature) { const a = rows.get(feature.properties.code, 2020), d = valid(a?.[view.index]) && valid(row?.[view.index]) ? (row![view.index] as number) - (a![view.index] as number) : null; delta = ` Δ trung bình hai mốc: ${fmt(d, INDEX[view.index].digits)} ${INDEX[view.index].unit}. Khác với Δ từng ô trên bản đồ.`; }
  const lc = p.cover.find(c => c.code === view.selected);
  const idx = INDEX[view.index];
  return (
    <View style={{gap: 10}}>
      <View style={{gap: 2}}>
        <Eyebrow>Thông tin khu vực</Eyebrow>
        <T w={800} s={24} lh={1.08} ls={-0.02} numberOfLines={2} style={{marginTop: 6}}>{feature?.properties.full_name ?? 'Chạm vào một xã/phường'}</T>
        <T mono s={11.5} color={C.ink2}>{feature ? `Mã ${feature.properties.code} · ${fmt(feature.properties.area_km2_source, 2)} km² (nguồn)` : 'Chọn trên bản đồ hoặc tìm theo tên'}</T>
      </View>
      <View style={{flexDirection: 'row', gap: 8, marginTop: 4}}>{INDICES.map(k => <Metric key={k} k={k} view={view} row={row} onPress={() => p.onIndex(k)} />)}</View>
      <YearRow view={view} canPlay={YEARS.length > 1 && view.display !== 'change'} playing={p.playing} onYear={p.onYear} onPlay={p.onPlay} />
      <Title>Tìm khu vực</Title>
      <Search data={data} onPick={p.onPick} />
      {hot && <Callout tone="err"><T w={700} s={13.5} lh={1.45}>{`Cảnh báo thử nghiệm: độ khô ${fmt(row!.tvdi)} (mức rất khô) ở mốc ${view.year}. Độ khô là chỉ số thử nghiệm, không phải cảnh báo hạn chính thức.`}</T></Callout>}
      <Callout tone={!feature || q === 'adequate' ? 'plain' : 'warn'}>{feature ? areaSentence(rows, feature.properties.code, view.year, view.index, YEARS[0]) : 'Chọn một khu vực để xem số liệu và so sánh với trung bình thành phố.'}</Callout>
      {tech || delta ? <Help>{tech + delta}</Help> : null}
      {feature && p.notes[feature.properties.code] ? <View style={{borderLeftWidth: 5, borderLeftColor: C.signal, backgroundColor: C.paper, paddingVertical: 8, paddingHorizontal: 12}}><T s={14} lh={1.4}><T w={700} s={14}>Ghi chú: </T>{p.notes[feature.properties.code]}</T></View> : null}
      {p.probe && (
        <View style={{borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: C.paper2, padding: 10, gap: 2}}>
          <T mono w={700} s={12}>{`${p.probe.lat.toFixed(4)}, ${p.probe.lng.toFixed(4)}`}</T>
          <T s={13}>{p.probe.loading ? 'Đang tra cứu ô mẫu…' : p.probe.error ? p.probe.error : valid(p.probe.value) ? `${fmt(p.probe.value, idx.digits)} ${idx.unit}${p.probe.change ? ' (chênh lệch hai mốc)' : ''} · ô gần nhất 120 m, khác trung bình xã/phường.` : p.probe.unavailable ? 'Chưa có bản xuất cho năm này.' : 'Thiếu dữ liệu tại ô này · ô gần nhất 120 m.'}</T>
        </View>
      )}
      {feature && <>
        <Title>{`Diễn biến ${idx.label}`}</Title>
        <TrendChart rows={rows} code={feature.properties.code} index={view.index} />
        <Help>Chỉ vẽ mốc có độ phủ ≥ 50%; không nối qua khoảng thiếu.</Help>
        <View style={{borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, padding: 10, gap: 4, backgroundColor: '#fff'}}>
          <T w={700} s={13}>Nguồn và ngày ảnh</T>
          <T s={13} lh={1.45}><T w={700} s={13}>Ngày ảnh: </T>{(row?.dates ?? []).map(dmy).join(', ') || 'không có'}</T>
          <Help>Các cảnh có thể khác ngày giữa khu vực và năm; kết quả là trung bình ô hợp lệ, không phải trung bình năm. Nhiệt độ ở đây là nhiệt độ bề mặt, không phải nhiệt độ không khí.</Help>
          {(row as any)?.recovery_pixels ? <Help>{`Bổ sung ${(row as any).recovery_pixels} ô thực từ cảnh ${((row as any).recovery_dates ?? []).join(', ')}; các ô gốc giữ nguyên.`}</Help> : null}
        </View>
        <LandCover row={lc} />
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4}}>
          <Button sm icon="plus" label={p.pinned.includes(feature.properties.code) ? 'Đã trong so sánh' : 'So sánh'} onPress={p.onPin} disabled={p.pinned.includes(feature.properties.code)} />
          <Button sm icon="table" label="Bảng số liệu" onPress={p.onTable} />
          <Button sm icon="download" label={view.landcover ? 'Tải lớp phủ 2021' : view.display === 'change' ? 'Tải GeoTIFF chênh lệch' : 'Tải GeoTIFF ' + view.year} onPress={() => Linking.openURL(API_BASE + rasterLink(view))} />
        </View>
      </>}

      <Pressable onPress={() => setMore(m => !m)} accessibilityRole="button" accessibilityState={{expanded: more}} style={{marginTop: 10, borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS, backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <T w={700} s={15}>Tùy chọn bản đồ</T><T mono w={800} s={16}>{more ? '−' : '+'}</T>
      </Pressable>
      {more && (
        <View style={{gap: 10}}>
          <Title>Cách xem</Title>
          <Segmented options={DISPLAYS.map(d => ({...d, disabled: d.value === 'change' && !p.canChange}))} value={view.display} onChange={v => p.onPatch({display: v})} layout="grid2" label="Chế độ hiển thị" />
          <Help>{DISPLAY_HINT[view.display]}</Help>
          <Title>Lớp phủ</Title>
          {([['visible', `Lớp ${idx.label.toLowerCase()} đang xem`], ['boundaries', 'Ranh giới xã/phường'], ['labels', 'Tên khu vực (tự tránh chồng)'], ['landcover', 'Lớp phủ đất ESA 2021'], ['compare', 'So sánh kéo màn hình 2020 | năm chọn']] as const).map(([key, label]) => {
            const checked = key === 'compare' ? p.compare : (view as any)[key] as boolean, disabled = key === 'compare' && (!p.canCompare || view.display !== 'raster' || view.landcover);
            return <Pressable key={key} disabled={disabled} onPress={() => p.onPatch({[key]: !checked} as any)} accessibilityRole="checkbox" accessibilityState={{checked, disabled}} style={{flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, opacity: disabled ? 0.4 : 1}}><CheckMark checked={checked} /><T w={600} s={15}>{label}</T></Pressable>;
          })}
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Field label="Độ đậm của lớp"><View /></Field><T mono s={13}>{Math.round(view.opacity * 100) + '%'}</T></View>
          <Slider min={10} max={100} step={5} value={Math.round(view.opacity * 100)} onChange={v => p.onPatch({opacity: v / 100})} label="Độ đậm của lớp" />
          <Title>Bản đồ nền</Title>
          <Segmented options={BASES} value={view.basemap} onChange={v => p.onPatch({basemap: v})} layout="grid2" label="Bản đồ nền" />
          <Help>{BASE_NOTE[view.basemap]}</Help>
        </View>
      )}
      {p.fromCache && <Help>Đang dùng số liệu đã lưu trên máy vì không có mạng.</Help>}
      <Help>{p.rowsFrom === 'api' ? 'Số liệu: đọc từ cơ sở dữ liệu qua máy chủ.' : p.rowsFrom === 'file' ? 'Số liệu: tệp xuất sẵn (máy chủ cơ sở dữ liệu chưa trả lời).' : 'Số liệu: bản đã lưu trên máy.'}</Help>
    </View>
  );
}
