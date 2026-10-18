import {View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {INDEX, TVDI_CLASSES, type IndexKey} from '@/lib/format';
import {BW, C, T} from '@/ds';

/** `.ramp`: the fixed colour scale of an index with its end values. */
export function Ramp({colors, min, max, unit = '', height = 14}: {colors: string[]; min: number | string; max: number | string; unit?: string; height?: number}) {
  const id = 'g' + colors[0].slice(1) + colors.length;
  return (
    <View>
      <Svg height={height} width="100%"><Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">{colors.map((c, i) => <Stop key={i} offset={i / (colors.length - 1)} stopColor={c} />)}</LinearGradient></Defs><Rect x={1} y={1} width="99%" height={height - 2} rx={3} fill={`url(#${id})`} stroke={C.ink} strokeWidth={BW} /></Svg>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 3}}><T mono s={11} color={C.ink2}>{`${min}${unit ? ' ' + unit : ''}`}</T><T mono s={11} color={C.ink2}>{`${max}${unit ? ' ' + unit : ''}`}</T></View>
    </View>
  );
}

export function Legend({index, compact}: {index: IndexKey; compact?: boolean}) {
  const spec = INDEX[index];
  return (
    <View accessibilityLabel={`Chú giải ${spec.name}`} style={{gap: 6}}>
      <T w={800} s={13}>{spec.name}{spec.experimental ? ' · thử nghiệm' : ''}</T>
      <Ramp colors={spec.colors} min={String(spec.min).replace('.', ',')} max={String(spec.max).replace('.', ',')} unit={spec.unit} />
      {index === 'tvdi' && (
        <View style={{flexDirection: 'row', marginTop: 4, gap: 2}}>
          {TVDI_CLASSES.map((c, i) => <View key={c.name} style={{flex: 1, alignItems: 'center'}}><T mono s={9} color={C.ink2}>{`${i ? String(TVDI_CLASSES[i - 1].max).replace('.', ',') : '0'}–${String(Math.min(c.max, 1)).replace('.', ',')}`}</T><T w={700} s={10} align="center">{c.name}</T></View>)}
        </View>
      )}
      {!compact && <T s={11} lh={1.4} color={C.ink3}>Thang màu cố định giữa các năm. Vùng trống: thiếu ảnh dùng được, không phải giá trị 0.</T>}
    </View>
  );
}
