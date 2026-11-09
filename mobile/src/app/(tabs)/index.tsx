/** Bản đồ: màn hình chính. Chỉ gồm những thứ hay dùng; thẻ khu vực chỉ hiện khi chạm vào một xã/phường. */
import {useCallback, useEffect, useRef, useState} from 'react';
import {Modal, Pressable, ScrollView, Share, View} from 'react-native';
import {useRouter} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import {ZonesMap, type ZonesHandle} from '@/map/ZonesMap';
import {Btn, Dot, Ramp, Seg, T, st} from '@/ui/kit';
import {Icon} from '@/ui/Icon';
import {IndexSwitch} from '@/ui/IndexSwitch';
import {Glossary} from '@/ui/Glossary';
import {C} from '@/ui/theme';
import {APP_SHORT, PAGES} from '@/lib/config';
import {INDEX, INDICES, YEARS, confidence, dmy, fmt, indexTitle, colorOf, tvdiClass, type IndexKey} from '@/lib/format';
import {eligible} from '@/lib/policy';
import {getRows, names, tileMeta, useDataVersion} from '@/lib/data';
import {getState, setState, useStore} from '@/lib/store';
import {session, onSession} from '@/lib/api';

function useUser() { const [u, setU] = useState(session.user); useEffect(() => onSession(() => setU(session.user)), []); return u; }

export default function MapScreen() {
  const insets = useSafeAreaInsets(), router = useRouter(), map = useRef<ZonesHandle>(null);
  const index = useStore(s => s.index), year = useStore(s => s.year), selected = useStore(s => s.selected), lite = useStore(s => s.lite);
  const dims = useStore(s => s.dims), basemap = useStore(s => s.basemap), pixel = useStore(s => s.pixel);
  const [tools, setTools] = useState(false), [gloss, setGloss] = useState(false), [playing, setPlaying] = useState(false), [tiles, setTiles] = useState<string | null>(null);
  const user = useUser(); useDataVersion();
  const onPick = useCallback((code: string | null) => setState({selected: code}), []);
  useEffect(() => {   // ô ảnh 120 m: lấy địa chỉ lớp ảnh của năm/chỉ số đang chọn
    if (!pixel) { setTiles(null); return; }
    let alive = true; tileMeta(year, index).then(m => alive && setTiles(m?.tiles ?? null)).catch(() => alive && setTiles(null));
    return () => { alive = false; };
  }, [pixel, year, index]);
  useEffect(() => {   // phát diễn biến 2020 → 2025
    if (!playing) return;
    const t = setInterval(() => { const y = getState().year; if (y >= 2025) { setPlaying(false); } else setState({year: y + 1}); }, lite ? 1800 : 1300);
    return () => clearInterval(t);
  }, [playing, lite]);
  const row = selected ? getRows().get(selected, year) : undefined, spec = INDEX[index];

  const snapshot = async () => {
    setTools(false);
    const uri = await map.current?.snapshot();
    if (uri && await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri.startsWith('file') ? uri : 'file://' + uri, {mimeType: 'image/png', dialogTitle: 'Lưu hoặc gửi ảnh bản đồ'});
  };
  return (
    <View style={{flex: 1, backgroundColor: C.bg}}>
      <ZonesMap ref={map} index={index} year={year} selected={selected} dims={dims} basemap={basemap} pixelTiles={tiles} lite={lite} onPick={onPick}
        padding={{top: insets.top + 150, right: 24, bottom: 170, left: 24}} />

      {/* thanh trên: tên + tài khoản + chọn chỉ số */}
      <View style={[st.float, {position: 'absolute', top: insets.top + 8, left: 10, right: 10, padding: 10, gap: 8}]}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <T s={13.5} w="800" lines={2} style={{flex: 1}}>{APP_SHORT}</T>
          <Btn small tone="primary" icon="user" label={user ? user.display_name.slice(0, 12) : 'Đăng nhập'} onPress={() => router.push('/tai-khoan')} />
        </View>
        <IndexSwitch />
        <View style={{flexDirection: 'row', gap: 6}}>
          <Btn small label={dims === '3d' ? '3D' : '2D'} icon="layers" onPress={() => setState({dims: dims === '3d' ? '2d' : '3d', pixel: false})} style={{flex: 1}} />
          <Btn small label={pixel ? 'Ô 120 m' : 'Xã/phường'} icon="grid" onPress={() => setState({pixel: !pixel, dims: '2d'})} style={{flex: 1.3}} />
          <Btn small icon="more" label="Thêm" onPress={() => setTools(true)} style={{flex: 1}} />
        </View>
      </View>

      {/* chú giải */}
      <Pressable onPress={() => setGloss(true)} style={[st.float, {position: 'absolute', top: insets.top + 168, left: 10, width: 210, padding: 8, gap: 4}]} accessibilityRole="button" accessibilityLabel="Ý nghĩa chỉ số">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><T s={12} w="800" lines={2} style={{flex: 1}}>{indexTitle(index)}</T><Icon name="info" size={16} color={C.accent2} /></View>
        <Ramp k={index} />
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><T s={11} color={C.ink2}>{fmt(spec.min, spec.digits === 1 ? 0 : 1)}</T><T s={11} color={C.ink2}>{fmt(spec.max, spec.digits === 1 ? 0 : 1)}</T></View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}><Dot color="#c3ccd5" /><T s={10.5} color={C.ink3}>Xám: chưa đủ dữ liệu ảnh</T></View>
      </Pressable>

      {/* thẻ khu vực: chỉ khi đã chọn */}
      {selected && (
        <View style={[st.float, {position: 'absolute', left: 10, right: 10, bottom: 92, padding: 12, gap: 8}]}>
          <View style={{flexDirection: 'row', alignItems: 'flex-start', gap: 8}}>
            <View style={{flex: 1}}><T s={16} w="800" lines={1}>{names.get(selected)}</T>
              <T s={12} color={C.ink3}>Mùa khô {year}{row?.dates?.length ? ' · ảnh ' + dmy(row.dates[0]).slice(0, 5) + (row.dates.length > 1 ? '–' + dmy(row.dates[row.dates.length - 1]) : '') : ''}</T></View>
            <Pressable hitSlop={12} onPress={() => setState({selected: null})} accessibilityLabel="Đóng"><Icon name="x" size={20} color={C.ink3} /></Pressable>
          </View>
          <View style={{flexDirection: 'row', gap: 6}}>
            {INDICES.map(k => { const ok = eligible(row, k), conf = confidence(row?.[`${k}_coverage` as const]); return (
              <Pressable key={k} onPress={() => setState({index: k})} style={{flex: 1, borderRadius: 10, borderWidth: k === index ? 2 : 1, borderColor: k === index ? C.accent : C.line, padding: 7, gap: 2}}>
                <T s={11} w="700" color={C.ink3}>{INDEX[k].code} · {INDEX[k].label}</T>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>{ok && <Dot color={colorOf(row![k], k)} />}<T s={17} w="800">{ok ? fmt(row![k], INDEX[k].digits) : '—'}</T></View>
                <T s={10.5} w="600" color={ok ? (conf.key === 'high' ? C.ok : C.warnInk) : C.ink3}>{ok ? 'Tin cậy ' + conf.text.toLowerCase() : 'Chưa đủ dữ liệu'}</T>
              </Pressable>); })}
          </View>
          {eligible(row, 'tvdi') && row!.tvdi! >= 0.8 && <T s={12} color={C.warnInk}>Độ khô {fmt(row!.tvdi)} ({tvdiClass(row!.tvdi)!.name.toLowerCase()}) · chỉ số thử nghiệm, không phải cảnh báo hạn</T>}
          <Pressable onPress={() => router.navigate('/du-bao')}><T s={13} w="700" color={C.accent2}>Xem dự báo tháng của khu vực này ›</T></Pressable>
        </View>
      )}

      {/* thanh thời gian */}
      <View style={[st.float, {position: 'absolute', left: 10, right: 10, bottom: 10, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8}]}>
        <Pressable onPress={() => { if (!playing && getState().year >= 2025) setState({year: 2020}); setPlaying(!playing); }} accessibilityLabel={playing ? 'Dừng' : 'Phát 2020–2025'}
          style={{width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={playing ? 'pause' : 'play'} size={18} color="#fff" />
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 4}}>
          {YEARS.map(y => <Pressable key={y} onPress={() => { setPlaying(false); setState({year: y}); }} style={{paddingHorizontal: 9, paddingVertical: 8, borderRadius: 9, backgroundColor: y === year ? C.accent : 'transparent'}}>
            <T s={14} w={y === year ? '800' : '600'} color={y === year ? '#fff' : C.ink2}>{y}</T></Pressable>)}
        </ScrollView>
      </View>

      <View style={{position: 'absolute', right: 10, top: insets.top + 168, gap: 6}}>
        <Btn small icon="plus" onPress={() => map.current?.zoomBy(1)} />
        <Btn small icon="minus" onPress={() => map.current?.zoomBy(-1)} />
        <Btn small icon="extent" onPress={() => map.current?.fitAll()} />
      </View>

      <Modal visible={tools} transparent animationType="fade" onRequestClose={() => setTools(false)}>
        <Pressable style={{flex: 1, backgroundColor: '#0005', justifyContent: 'flex-end'}} onPress={() => setTools(false)}>
          <Pressable style={{backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: insets.bottom + 16, gap: 12}}>
            <T s={17} w="800">Công cụ bản đồ</T>
            <T s={12.5} w="700" color={C.ink3}>BẢN ĐỒ NỀN</T>
            <Seg options={[{value: 'osm', label: 'Bản đồ'}, {value: 'sat', label: 'Vệ tinh'}, {value: 'plain', label: 'Nhẹ (không tải)'}]} value={basemap} onChange={v => setState({basemap: v as any})} />
            <Btn icon="extent" label="Xem toàn vùng" onPress={() => { setTools(false); map.current?.fitAll(); }} />
            <Btn icon="download" label="Lưu ảnh bản đồ (PNG)" onPress={snapshot} />
            <Btn icon="share" label="Chia sẻ liên kết bản web" onPress={() => { setTools(false); Share.share({message: `${PAGES}/#/?chi-so=${index}&nam=${year}${selected ? '&khu-vuc=' + selected : ''}`}); }} />
            <Btn icon="info" label="LST, NDVI, TVDI nghĩa là gì?" onPress={() => { setTools(false); setGloss(true); }} />
          </Pressable>
        </Pressable>
      </Modal>
      <Glossary open={gloss} onClose={() => setGloss(false)} focus={index} />
    </View>
  );
}
