import {useEffect, useMemo, useState} from 'react';
import {Pressable, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {Block, Button, Callout, Card, CheckMark, Eyebrow, Field, Icon, Input, Page, PageHead, Reveal, Segmented, Select, T, Table, Tag, C, useToast, type Col} from '@/ds';
import {BarChart} from '@/charts/Charts';
import {LineChart} from '@/charts/Charts';
import {useData} from '@/components/DataProvider';
import type {Row} from '@/lib/data';
import {INDEX, INDICES, YEARS, dmy, fmt, normalize, pct, shortName, valid, type IndexKey} from '@/lib/format';
import {shareCsv} from '@/lib/exportCsv';

const ENOUGH = 0.5, LOW = 0.1, PAGE = 25;
type Q = 'ok' | 'low' | 'sparse' | 'missing' | 'unknown';
const quality = (row: Row, k: IndexKey): Q => { if (!valid(row[k])) return 'missing'; const c = row[`${k}_coverage` as const]; if (!valid(c)) return 'unknown'; return c >= ENOUGH ? 'ok' : c >= LOW ? 'low' : 'sparse'; };
const minCoverage = (row: Row) => Math.min(...INDICES.map(k => (row[`${k}_coverage` as const] as number) ?? 0));
const TAG: Record<Q, string> = {ok: 'Đủ mẫu', low: 'Ít mẫu', sparse: 'Rất ít mẫu', missing: 'Thiếu', unknown: 'Chưa rõ'};
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

function summarize(rows: Row[], k: IndexKey, year: number, minCov: number) {
  const have = rows.filter(r => r.year === year && valid(r[k])), used = have.filter(r => ((r[`${k}_coverage` as const] as number) ?? 0) >= minCov);
  const values = used.map(r => r[k] as number), weights = used.reduce((s, r) => s + ((r[`${k}_pixels` as const] as number) || 0), 0), sorted = [...used].sort((a, b) => (a[k] as number) - (b[k] as number));
  return {have: have.length, used: used.length, weighted: weights ? used.reduce((s, r) => s + (r[k] as number) * ((r[`${k}_pixels` as const] as number) || 0), 0) / weights : null,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, median: median(values), min: sorted[0], max: sorted.at(-1)};
}

export default function Tables() {
  const {data} = useData();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{q?: string}>();
  const [view, setView] = useState<'detail' | 'summary'>('detail');
  const [year, setYear] = useState<string>('2025');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const [sort, setSort] = useState<{key: string; dir: 1 | -1}>({key: 'name', dir: 1});
  const [page, setPage] = useState(0);
  const [minCov, setMinCov] = useState(0.5);
  const [rankIndex, setRankIndex] = useState<IndexKey>('lst');
  useEffect(() => { if (params.q) { const f = data?.geo.features.find(x => x.properties.code === params.q); setQ(f ? f.properties.name : params.q); setPage(0); } }, [params.q, data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.rows ?? [];
  const shown = useMemo(() => {
    const nq = normalize(q);
    const out = rows.filter(r => (year === 'all' || String(r.year) === year) && (!nq || normalize(r.name).includes(nq) || String(r.code || '').includes(nq)) && (!only || INDICES.every(k => quality(r, k) === 'ok')));
    const val = (r: Row): any => sort.key === 'name' ? normalize(r.name) : sort.key === 'coverage' ? minCoverage(r) : (r as any)[sort.key];
    return out.sort((a, b) => { const x = val(a), y = val(b); return x == null ? 1 : y == null ? -1 : x < y ? -sort.dir : x > y ? sort.dir : 0; });
  }, [rows, year, q, only, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), cur = Math.min(page, pages - 1);

  const cols: Col<Row>[] = [
    {key: 'name', label: 'Khu vực', width: 190, sort: 'name', render: r => <View><T w={700} s={14}>{r.name}</T><T mono s={11} color={C.ink3}>{'Mã ' + r.code}</T></View>},
    {key: 'year', label: 'Năm', width: 70, sort: 'year', num: true},
    ...INDICES.map(k => ({key: k, label: INDEX[k].label + (INDEX[k].unit ? ' ' + INDEX[k].unit : '') + (INDEX[k].experimental ? ' *' : ''), width: 96, sort: k as string, num: true,
      render: (r: Row) => <T mono s={14} tab color={quality(r, k) === 'missing' ? C.ink3 : C.ink}>{quality(r, k) === 'missing' ? '—' : fmt(r[k], INDEX[k].digits)}</T>,
      flag: (r: Row) => { const s = quality(r, k); return s === 'low' ? C.warnBg : s === 'sparse' ? C.sparse : undefined; }})),
    {key: 'coverage', label: 'Độ phủ mẫu', width: 170, sort: 'coverage', render: r => {
      const states = INDICES.map(k => quality(r, k)), worst = (['missing', 'sparse', 'low', 'unknown'] as Q[]).find(x => states.includes(x)) || 'ok';
      return <View style={{gap: 3}}><Tag tone={worst === 'ok' ? 'ok' : worst === 'low' || worst === 'unknown' ? 'low' : worst === 'sparse' ? 'sparse' : 'missing'}>{TAG[worst]}</Tag>{valid(r.lst_coverage) ? <T mono s={11} color={C.ink2}>{INDICES.map(k => pct(r[`${k}_coverage` as const])).join(' · ')}</T> : null}</View>;
    }},
    {key: 'dates', label: 'Ngày ảnh', width: 150, render: r => { const d = [...(r.dates ?? [])].sort(); return d.length ? <View><T s={13}>{d[0] === d.at(-1) ? dmy(d[0]) : `${dmy(d[0])} – ${dmy(d.at(-1)!)}`}</T><T mono s={11} color={C.ink3}>{`${d.length} ngày`}</T></View> : <T s={13}> </T>; }},
    {key: 'go', label: '', width: 60, render: r => <Pressable onPress={() => router.navigate({pathname: '/', params: {'khu-vuc': r.code, nam: String(r.year)}} as any)} accessibilityRole="button" accessibilityLabel={`Xem ${r.name} trên bản đồ`} hitSlop={8} style={{width: 36, height: 36, borderWidth: 2, borderColor: C.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff'}}><Icon name="map" size={16} /></Pressable>},
  ];
  const onSort = (key: string) => { setSort(s => ({key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1})); setPage(0); };
  const exportCsv = async () => {
    if (!shown.length) return toast('Không có dòng nào để xuất.', {error: true});
    try { await shareCsv('mobilegis_bang_so_lieu.csv', ['code', 'name', 'year', 'lst', 'ndvi', 'tvdi', 'lst_coverage', 'ndvi_coverage', 'tvdi_coverage', 'dates'], shown); } catch (e: any) { toast(e.message || 'Không xuất được CSV.', {error: true}); }
  };

  const years = [...new Set(rows.map(r => r.year))].sort();
  const units = new Set(rows.map(r => r.code)).size;
  const rankYear = year === 'all' ? years.at(-1)! : +year, idx = INDEX[rankIndex];
  const eligible = rows.filter(r => r.year === rankYear && valid(r[rankIndex]) && ((r[`${rankIndex}_coverage` as const] as number) ?? 0) >= minCov).sort((a, b) => (b[rankIndex] as number) - (a[rankIndex] as number));
  const item = (r: Row) => ({label: shortName(r.name), value: r[rankIndex] as number, note: [`Mã ${r.code}`, `Độ phủ ${pct(r[`${rankIndex}_coverage` as const])}`]});

  return (
    <Page back={{label: 'Chuyên gia', href: '/chuyen-gia'}}>
      <PageHead eyebrow="Bảng số liệu" title="Số liệu nhiệt độ, độ xanh, độ khô theo xã/phường" intro="Mọi số đều kèm độ phủ mẫu. Ô trống nghĩa là không có số liệu, không phải 0." />
      <Segmented options={[{value: 'detail', label: 'Bảng chi tiết'}, {value: 'summary', label: 'Bảng tổng'}]} value={view} onChange={setView} label="Kiểu bảng" />
      <View style={{height: 14}} />
      <Card flat pad={14}>
        <View style={{gap: 12}}>
          <Field label="Tìm khu vực"><Input value={q} onChangeText={t => { setQ(t); setPage(0); }} placeholder="Tên hoặc mã khu vực…" autoCorrect={false} accessibilityLabel="Tìm khu vực" /></Field>
          <Field label="Năm"><Select label="Năm" value={year} onChange={v => { setYear(v); setPage(0); }} options={[{value: 'all', label: 'Tất cả năm'}, ...YEARS.map(y => ({value: String(y), label: 'Năm ' + y}))]} /></Field>
          {view === 'summary' ? <>
            <Field label="Xếp hạng theo"><Segmented options={INDICES.map(k => ({value: k, label: INDEX[k].label}))} value={rankIndex} onChange={setRankIndex} label="Xếp hạng theo" /></Field>
            <Field label="Ngưỡng độ phủ"><Select label="Ngưỡng độ phủ" value={String(minCov)} onChange={v => setMinCov(+v)} options={[{value: '0.1', label: '≥ 10%'}, {value: '0.5', label: '≥ 50% · khuyến nghị'}, {value: '0.8', label: '≥ 80%'}]} /></Field>
          </> : (
            <Pressable onPress={() => { setOnly(o => !o); setPage(0); }} accessibilityRole="checkbox" accessibilityState={{checked: only}} style={{flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40}}><CheckMark checked={only} /><T w={600} s={15} style={{flex: 1}}>Chỉ khu vực đủ dữ liệu (≥ 50% ảnh dùng được)</T></Pressable>
          )}
        </View>
      </Card>
      <View style={{marginTop: 14, flexDirection: 'row'}}><Button tone="primary" icon="download" label="Xuất bảng đang xem (CSV)" onPress={exportCsv} /></View>
      <View style={{marginTop: 14}}><Callout>Ô nền vàng là khu vực ít pixel hợp lệ: số vẫn là số thật nhưng chưa đại diện cả khu vực. * Độ khô là chỉ số thử nghiệm.</Callout></View>

      {view === 'detail' ? (
        <View style={{marginTop: 16, gap: 12}}>
          <T mono s={13} color={C.ink2}>{`${shown.length.toLocaleString('vi-VN')} dòng`}</T>
          <Table cols={cols} rows={shown.slice(cur * PAGE, cur * PAGE + PAGE)} rowKey={(r, i) => r.code + r.year + i} sort={sort} onSort={onSort} empty="Không có dòng nào khớp bộ lọc." />
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
            <Button sm label="‹ Trước" disabled={cur === 0} onPress={() => setPage(cur - 1)} /><T mono s={12} align="center" style={{flex: 1}}>{`Trang ${cur + 1}/${pages}`}</T><Button sm label="Sau ›" disabled={cur >= pages - 1} onPress={() => setPage(cur + 1)} />
          </View>
        </View>
      ) : (
        <View>
          <Block title="Xu hướng toàn vùng" sub={`Trung bình theo pixel hợp lệ của các khu vực đủ mẫu (≥ ${Math.round(minCov * 100)}%), ${units} khu vực.`}>
            <View style={{gap: 14}}>{INDICES.map((k, i) => (
              <Reveal key={k} index={i}><Card pad={14}><View style={{gap: 6}}>
                <Eyebrow>{INDEX[k].label + (INDEX[k].experimental ? ' · thử nghiệm' : '')}</Eyebrow><T w={800} s={18}>{INDEX[k].name}</T>
                <LineChart compact unit={INDEX[k].unit} minPad={k === 'lst' ? 1 : 0.03} yFormat={v => fmt(v, INDEX[k].digits)} xs={years} series={[{id: k, name: 'Trung bình toàn vùng', color: C.ink, points: years.map(y => { const s = summarize(rows, k, y, minCov); return {x: y, y: s.weighted, lines: [`${s.used}/${s.have} khu vực đủ mẫu`]}; })}]} />
              </View></Card></Reveal>
            ))}</View>
          </Block>
          <Block title="Tổng hợp theo năm">
            <Table minWidth={900} rowKey={r => r.k + r.y} rows={INDICES.flatMap(k => years.map((y, n) => ({k, y, n, s: summarize(rows, k, y, minCov)})))} cols={[
              {key: 'k', label: 'Chỉ số', width: 120, render: r => r.n === 0 ? <View><T w={800} s={14}>{INDEX[r.k].label}</T><T s={11} color={C.ink3}>{INDEX[r.k].name}</T></View> : <T s={12}> </T>},
              {key: 'y', label: 'Năm', width: 64, num: true, render: r => <T mono s={13}>{String(r.y)}</T>},
              {key: 'used', label: 'Đủ mẫu', width: 84, num: true, render: r => <T mono s={13}>{`${r.s.used}/${r.s.have}`}</T>},
              {key: 'w', label: 'TB toàn vùng', width: 104, num: true, render: r => <T mono w={800} s={13}>{fmt(r.s.weighted, INDEX[r.k].digits)}</T>},
              {key: 'm', label: 'TB các khu vực', width: 112, num: true, render: r => <T mono s={13}>{fmt(r.s.mean, INDEX[r.k].digits)}</T>},
              {key: 'md', label: 'Trung vị', width: 90, num: true, render: r => <T mono s={13}>{fmt(r.s.median, INDEX[r.k].digits)}</T>},
              {key: 'lo', label: 'Thấp nhất', width: 150, render: r => r.s.min ? <View><T mono w={700} s={13}>{fmt(r.s.min[r.k], INDEX[r.k].digits)}</T><T s={11} color={C.ink3} numberOfLines={1}>{r.s.min.name}</T></View> : <T s={12}> </T>},
              {key: 'hi', label: 'Cao nhất', width: 150, render: r => r.s.max ? <View><T mono w={700} s={13}>{fmt(r.s.max[r.k], INDEX[r.k].digits)}</T><T s={11} color={C.ink3} numberOfLines={1}>{r.s.max.name}</T></View> : <T s={12}> </T>},
            ]} />
          </Block>
          <Block title={`Xếp hạng · ${idx.label} · năm ${rankYear}`} sub="Xếp theo giá trị chỉ số, không phải mức rủi ro đã kiểm định.">
            <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>10 khu vực cao nhất</T><BarChart items={eligible.slice(0, 10).map(item)} digits={idx.digits} unit={idx.unit} /></View></Card>
            <Card pad={14}><View style={{gap: 6}}><T w={800} s={17}>10 khu vực thấp nhất</T><BarChart items={eligible.slice(-10).reverse().map(item)} digits={idx.digits} unit={idx.unit} /></View></Card>
          </Block>
          <View style={{marginTop: 16}}><Callout>“TB toàn vùng” là trung bình theo pixel hợp lệ của các khu vực đủ mẫu, không phải trung bình khí hậu năm. Số liệu là mùa khô theo ngày ảnh từng khu vực; Độ khô là chỉ số thử nghiệm; chênh lệch giữa các năm chưa là xu thế đã kiểm định.</Callout></View>
        </View>
      )}
      <View style={{height: 30}} />
    </Page>
  );
}
