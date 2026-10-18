import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, Share, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import * as Location from 'expo-location';
import {Button, Icon, IconButton, Skeleton, T, ViewIn, C, BW, PressBox, useToast} from '@/ds';
import {useData} from '@/components/DataProvider';
import {INDEX, valid, YEARS, type IndexKey} from '@/lib/format';
import {communeAt} from '@/lib/geo';
import {eligible} from '@/lib/policy';
import {get} from '@/lib/api';
import {loadExtras, type Extras} from '@/lib/data';
import {getState, setState, useStore} from '@/lib/store';
import {MapCanvas, type Display, type MapHandle, type MapView} from '@/map/MapCanvas';
import {BottomSheet, PEEK} from '@/map/BottomSheet';
import {SheetContent, type Probe} from '@/map/SheetContent';
import {BarLoader, Fabs, Kpis, MapLegend, StatusCallout} from '@/map/MapOverlays';
import {Locator, type ViewBounds} from '@/map/Locator';

export default function MapScreen() {
  const {status, data, rows, error, reload} = useData();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{'khu-vuc'?: string; nam?: string; 'chi-so'?: string; 'che-do'?: string}>();
  const handle = useRef<MapHandle>(null);
  const shared = useStore(s => s);
  const [view, setView] = useState<Omit<MapView, 'index' | 'year' | 'selected'>>({display: 'raster', basemap: 'streets', boundaries: true, labels: true, landcover: false, opacity: 1, visible: true});
  const [compare, setCompare] = useState(false);
  const [open, setOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [locatorOpen, setLocatorOpen] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [me, setMe] = useState<{lat: number; lng: number} | null>(null);
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  const [playing, setPlaying] = useState(false);
  const [bounds, setBounds] = useState<ViewBounds | null>(null);
  const probeToken = useRef(0);
  const fitted = useRef(false);
  const full: MapView = {...view, index: shared.index, year: shared.year, selected: shared.selected};

  useEffect(() => { if (status === 'ready') loadExtras().then(setExtras).catch(() => {}); }, [status]);
  // Deep links from other screens (ranking rows, table, statistics): ?khu-vuc=&nam=&chi-so=&che-do=
  useEffect(() => {
    if (!data) return;
    const p: any = {};
    if (params['chi-so'] && params['chi-so'] in INDEX) p.index = params['chi-so'];
    if (params.nam && YEARS.includes(+params.nam)) p.year = +params.nam;
    if (params['khu-vuc']) p.selected = params['khu-vuc'];
    if (Object.keys(p).length) setState(p);
    if (params['che-do'] && ['raster', 'zones', 'change', 'coverage'].includes(params['che-do'])) setView(v => ({...v, display: params['che-do'] as Display}));
    if (params['khu-vuc']) { const f = data.geo.features.find(x => x.properties.code === params['khu-vuc']); if (f) setTimeout(() => handle.current?.flyTo(f.properties.lon, f.properties.lat, 11), 400); }
  }, [params['khu-vuc'], params.nam, params['chi-so'], params['che-do'], data]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { get<{text: string}>('/api/notice', 10000).then(n => setNotice(n.text || '')).catch(() => {}); get<{notes: Record<string, string>}>('/api/content', 10000).then(c => setNotes(c.notes || {})).catch(() => {}); }, []);
  useEffect(() => { if (!playing) return; const t = setInterval(() => { const i = YEARS.indexOf(getState().year); setState({year: YEARS[(i + 1) % YEARS.length]}); }, 1700); return () => clearInterval(t); }, [playing]);

  const feature = useMemo(() => data?.geo.features.find(f => f.properties.code === shared.selected) ?? null, [data, shared.selected]);
  const adequate = useMemo(() => rows ? rows.year(shared.year).filter(r => eligible(r, shared.index)).length : 0, [rows, shared.year, shared.index]);
  const hasChange = !!data?.products.change[shared.index];
  const meta = data?.products.absolute[String(shared.year)]?.[shared.index];

  const pick = useCallback((code: string, fly = true) => {
    setProbe(null); setState({selected: code});
    const f = data?.geo.features.find(x => x.properties.code === code);
    if (fly && f) handle.current?.flyTo(f.properties.lon, f.properties.lat, 11);
  }, [data]);

  const onTap = useCallback(async (lng: number, lat: number) => {
    if (!data) return;
    setNotice(n => n);
    const code = communeAt(data.geo, lat, lng);
    if (code) pick(code, false);
    const v = {...view, ...getState()};
    if (!v.visible || v.landcover || (v.display !== 'raster' && v.display !== 'change')) { setProbe(null); return; }
    const token = ++probeToken.current, change = v.display === 'change' ? 1 : 0;
    setProbe({lat, lng, loading: true, change: !!change});
    try {
      const r = await get<{value: number | null; status?: string}>(`/api/sample?lat=${lat}&lon=${lng}&year=${v.year ?? getState().year}&index=${getState().index}&change=${change}&source=gee_recovery`, 12000);
      if (token === probeToken.current) setProbe({lat, lng, value: r.value, change: !!change, unavailable: r.status === 'unavailable'});
    } catch { if (token === probeToken.current) setProbe({lat, lng, error: 'Không tra cứu được ô này: máy chủ không phản hồi.'}); }
  }, [data, view, pick]);

  const locate = useCallback(async () => {
    const {status: perm} = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') return toast('Chưa có quyền vị trí. Bạn có thể bật trong Cài đặt hoặc chạm vào bản đồ.', {error: true});
    try {
      const pos = (await Location.getLastKnownPositionAsync({maxAge: 120000}).catch(() => null)) ?? await Promise.race([Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High}), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
      const {latitude: lat, longitude: lng} = pos.coords;
      setMe({lat, lng}); handle.current?.flyTo(lng, lat, 12);
      const code = data ? communeAt(data.geo, lat, lng) : null;
      if (code) { setState({selected: code}); toast(`Bạn đang ở ${data!.geo.features.find(f => f.properties.code === code)!.properties.full_name}. Tọa độ không được lưu.`); }
      else toast('Vị trí của bạn nằm ngoài 167 xã/phường được thống kê.', {error: true});
    } catch { toast('Không lấy được vị trí. Kiểm tra GPS hoặc đặt vị trí cho máy giả lập.', {error: true}); }
  }, [data, toast]);

  const share = useCallback(() => {
    const name = feature?.properties.full_name ?? 'TP.HCM', row = feature ? rows?.get(feature.properties.code, shared.year) : undefined, spec = INDEX[shared.index];
    Share.share({message: `${name} · ${spec.name} ${shared.year}: ${valid(row?.[shared.index]) ? (row![shared.index] as number).toLocaleString('vi-VN', {maximumFractionDigits: spec.digits}) + ' ' + spec.unit : 'chưa đủ dữ liệu'}\nMobileGIS TP.HCM`}).catch(() => {});
  }, [feature, rows, shared]);

  const patch = useCallback((p: any) => {
    if ('compare' in p) { setCompare(!!p.compare); const {compare: _c, ...rest} = p; p = rest; if (p.compare) p.landcover = false; }
    setPlaying(false);
    setView(v => ({...v, ...p, ...(p.display && p.display !== 'raster' ? {} : {}), ...(p.landcover ? {} : {})}));
    if (p.landcover) setCompare(false);
  }, []);

  if (status !== 'ready' || !data || !rows) {
    return (
      <ViewIn style={{padding: 16, gap: 14, justifyContent: 'center'}}>
        {status === 'error'
          ? <View style={{gap: 12}}><T w={800} s={22}>Chưa tải được số liệu</T><T s={14} color={C.ink3}>{error}</T><Button label="Thử lại" tone="primary" onPress={reload} /></View>
          : <View style={{gap: 12}}><Skeleton height={26} /><Skeleton height={160} /><Skeleton height={90} /></View>}
      </ViewIn>
    );
  }
  const statusText = view.visible && !view.landcover && view.display === 'raster' && !meta ? `Chưa có lớp ảnh năm ${shared.year} ở nguồn này.` : view.display === 'change' && !hasChange ? 'Chưa có lớp chênh lệch ở nguồn này.' : '';
  return (
    <ViewIn>
      <View style={{flex: 1}} onLayout={e => setSize({w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height})}>
        <MapCanvas ref={handle} data={data} rows={rows} extras={extras} view={full} me={me} probe={probe} onTap={onTap} onIdle={() => { setLoading(false); if (!fitted.current) { fitted.current = true; handle.current?.fitAll(); } }} onRegion={setBounds} />
        <BarLoader on={loading} />
        <View pointerEvents="box-none" style={{position: 'absolute', left: 10, right: 10, top: notice ? 52 : 10, flexDirection: 'row', justifyContent: 'space-between'}}>
          <Kpis items={[{value: view.landcover ? '2021' : view.display === 'change' ? '2020→2025' : String(shared.year), label: 'Mốc ảnh'}, {value: `${adequate}/${data.geo.features.length}`, label: 'Khu vực phủ ≥50%'}]} />
          <Fabs>
            <IconButton icon="locate" label="Vị trí của tôi" onPress={locate} />
            <IconButton icon="extent" label="Xem toàn vùng" onPress={() => handle.current?.fitAll()} />
            <IconButton icon="share" label="Chia sẻ" onPress={share} />
            <IconButton icon="globe" label="Bản đồ định vị" active={locatorOpen} onPress={() => setLocatorOpen(o => !o)} />
          </Fabs>
        </View>
        {notice !== '' && <Pressable onPress={() => setNotice('')} accessibilityRole="alert" style={{position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: C.signal, borderBottomWidth: BW, borderColor: C.ink, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10}}><T w={600} s={13.5} lh={1.3} style={{flex: 1}}>{notice}</T><T w={800} s={18}>×</T></Pressable>}
        {statusText !== '' && <View style={{position: 'absolute', left: 10, right: 70, top: 66}}><StatusCallout text={statusText} /></View>}
        {locatorOpen && <View style={{position: 'absolute', left: 10, top: 62}}><Locator geo={data.geo} bounds={bounds} selected={shared.selected} onClose={() => setLocatorOpen(false)} onFit={() => handle.current?.fitAll()} onFocus={(lat, lng) => handle.current?.flyTo(lng, lat, 11)} /></View>}
        {!open && !locatorOpen && <View pointerEvents="box-none" style={{position: 'absolute', left: 10, bottom: PEEK + 14}}><MapLegend view={full} data={data} extras={extras} open={legendOpen} onToggle={() => setLegendOpen(o => !o)} /></View>}
        <BottomSheet open={open} onToggle={() => setOpen(o => !o)} height={size.h}>
          <SheetContent data={data} rows={rows} notes={notes} cover={extras?.cover ?? []} view={full} probe={probe} playing={playing} pinned={shared.pinned} fromCache={data.fromCache} rowsFrom={data.rowsFrom} canChange={hasChange} canCompare={false} compare={compare}
            onIndex={k => { setPlaying(false); setProbe(null); setState({index: k}); setView(v => ({...v, landcover: false, visible: true})); setOpen(false); }}
            onYear={y => { setProbe(null); setState({year: y}); }} onPlay={() => setPlaying(p => !p)} onPick={code => { pick(code); }} onPatch={patch}
            onPin={() => { const s = getState(); if (!s.selected || s.pinned.includes(s.selected)) return; if (s.pinned.length >= 4) return toast('Tối đa 4 khu vực so sánh. Bỏ bớt ở trang Thống kê.', {error: true}); setState({pinned: [...s.pinned, s.selected]}); toast('Đã thêm vào so sánh ở trang Thống kê.'); }}
            onTable={() => router.navigate({pathname: '/bang-so-lieu', params: {q: shared.selected}} as any)} />
        </BottomSheet>
      </View>
    </ViewIn>
  );
}
