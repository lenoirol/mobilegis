import {Pressable, ScrollView, View} from 'react-native';
import {BW, C, RADIUS_LG} from './tokens';
import {T} from './Text';

export interface Col<R> {key: string; label: string; width?: number; num?: boolean; mono?: boolean; sort?: string; render?: (row: R, index: number) => React.ReactNode; flag?: (row: R) => string | undefined}
/** `.tbl`: ink header row with mono labels, hairline row dividers, numbers right-aligned in mono. Scrolls sideways when wider than the screen. */
export function Table<R>({cols, rows, rowKey, minWidth, empty = 'Chưa có dữ liệu.', sort, onSort}: {cols: Col<R>[]; rows: R[]; rowKey: (row: R, i: number) => string; minWidth?: number; empty?: string; sort?: {key: string; dir: 1 | -1}; onSort?: (key: string) => void}) {
  const total = Math.max(minWidth ?? 0, cols.reduce((s, c) => s + (c.width ?? 110), 0));
  return (
    <View style={{borderWidth: BW, borderColor: C.ink, borderRadius: RADIUS_LG, backgroundColor: '#fff', overflow: 'hidden'}}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{minWidth: total}}>
          <View style={{flexDirection: 'row', backgroundColor: C.ink}}>
            {cols.map(c => (
              <Pressable key={c.key} disabled={!c.sort || !onSort} onPress={() => c.sort && onSort?.(c.sort)} accessibilityRole={c.sort ? 'button' : undefined} accessibilityLabel={c.sort ? `Sắp xếp theo ${c.label}` : undefined} style={{width: c.width ?? 110, paddingVertical: 10, paddingHorizontal: 12, alignItems: c.num ? 'flex-end' : 'flex-start'}}>
                <T mono w={700} s={11} ls={0.08} upper color="#fff">{c.label + (c.sort ? (sort?.key === c.sort ? (sort.dir > 0 ? ' ▲' : ' ▼') : ' ↕') : '')}</T>
              </Pressable>
            ))}
          </View>
          {rows.length === 0 && <View style={{padding: 16}}><T s={14} color={C.ink3}>{empty}</T></View>}
          {rows.map((r, i) => (
            <View key={rowKey(r, i)} style={{flexDirection: 'row', borderTopWidth: i ? 1.5 : 0, borderTopColor: C.hair}}>
              {cols.map(c => {
                const bg = c.flag?.(r);
                return (
                  <View key={c.key} style={{width: c.width ?? 110, paddingVertical: 11, paddingHorizontal: 12, alignItems: c.num ? 'flex-end' : 'flex-start', justifyContent: 'center', backgroundColor: bg}}>
                    {c.render ? c.render(r, i) : <T mono={c.mono || c.num} w={c.key === cols[0].key ? 700 : 500} s={14} tab>{String((r as any)[c.key] ?? '—')}</T>}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
