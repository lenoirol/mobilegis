import {useCallback, useEffect, useState} from 'react';
import {View} from 'react-native';
import {useRouter} from 'expo-router';
import {Block, Button, Callout, Card, Eyebrow, Field, Input, Page, PageHead, Reveal, Select, Slider, T, Table, Tag, C, BW, useToast} from '@/ds';
import {CountUp} from '@/components/CountUp';
import {useData} from '@/components/DataProvider';
import {get, isAdmin, post} from '@/lib/api';
import {INDEX, INDICES, YEARS, fmt, valid} from '@/lib/format';
import {indexRows} from '@/lib/data';
import {useSession} from '@/lib/session';
import {shareCsv} from '@/lib/exportCsv';

const STATUS: Record<string, ['ok' | 'low' | 'missing', string]> = {simulated: ['ok', 'Giả lập'], clipped: ['low', 'Giới hạn miền hợp lệ'], insufficient_base_coverage: ['missing', 'Thiếu mẫu cơ sở']};
interface RunRow {id: string; title: string; result_kind: string; base_year: number; target_year: number}
interface Unit {code: string; name: string; year: number; lst: number | null; ndvi: number | null; tvdi: number | null; lst_status: string; ndvi_status: string; tvdi_status: string}
interface RunResult {run: {id: string; result_kind: string; source_dataset_id: string; base_year: number; target_year: number; method: string; method_version: string; created_at: string; note?: string}; units: Unit[]}

function SliderField({label, min, max, step, value, onChange, unit, digits}: {label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; unit: string; digits: number}) {
  return (
    <View style={{gap: 4}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><T mono w={600} s={11} ls={0.1} upper color={C.ink2}>{label}</T><T mono w={700} s={13}>{`${value > 0 ? '+' : ''}${fmt(value, digits)} ${unit}`.trim()}</T></View>
      <Slider min={min} max={max} step={step} value={value} onChange={v => onChange(Math.round(v / step) * step)} label={label} />
    </View>
  );
}

/** Admin-only what-if tool: adds the offsets the user types to the observed data. Never a forecast. */
export default function Scenario() {
  const {data} = useData();
  const toast = useToast();
  const router = useRouter();
  const session = useSession();
  const admin = session.user?.role === 'admin';
  const [title, setTitle] = useState('Kịch bản minh họa từ hiện trạng 2025');
  const [base, setBase] = useState('2025');
  const [target, setTarget] = useState('2026');
  const [d, setD] = useState({lst: 0, ndvi: 0, tvdi: 0});
  const [cov, setCov] = useState('0.5');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runId, setRunId] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');

  const loadRun = useCallback(async (id: string) => {
    if (!id) return; setErr('');
    try { setResult(await get<RunResult>('/api/analysis/runs/' + id, 30000)); } catch (e: any) { setErr(e.message); setResult(null); }
  }, []);
  const loadRuns = useCallback(async (select?: string) => {
    try { const r = await get<RunRow[]>('/api/analysis/runs'); setRuns(r); const id = select ?? (r[0]?.id ?? ''); setRunId(id); if (id) loadRun(id); else setResult(null); } catch (e: any) { setErr(e.message); }
  }, [loadRun]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const submit = async () => {
    setBusy(true); setStatus('Đang tạo giả lập trong giao dịch PostgreSQL…');
    try {
      const r = await post<{id: string}>('/api/analysis/simulate', {title, source: 'gee_recovery', base_year: +base, target_year: +target, lst_delta: d.lst, ndvi_delta: d.ndvi, tvdi_delta: d.tvdi, coverage: +cov});
      setStatus('Đã lưu GIẢ LẬP. Số liệu hiện trạng không thay đổi.'); toast('Đã lưu kịch bản giả lập.'); await loadRuns(r.id);
    } catch (e: any) { setStatus(e.message); toast(e.message, {error: true}); } finally { setBusy(false); }
  };
  const baseline = data ? indexRows(data.rows) : null;
  const exportCsv = async () => {
    if (!result) return toast('Chưa chọn kết quả.', {error: true});
    try { await shareCsv(`MobileGIS_gia_lap_${result.run.target_year}.csv`, ['run_id', 'result_kind', 'source', 'base_year', 'code', 'name', 'year', 'lst', 'ndvi', 'tvdi', 'lst_status', 'ndvi_status', 'tvdi_status'], result.units.map(u => ({run_id: result.run.id, result_kind: result.run.result_kind, source: result.run.source_dataset_id, base_year: result.run.base_year, ...u}))); } catch (e: any) { toast(e.message, {error: true}); }
  };
  return (
    <Page back={{label: 'Chuyên gia', href: '/chuyen-gia'}}>
      <PageHead eyebrow="Kết quả tách biệt với hiện trạng" title="Kịch bản giả lập" intro="Công cụ minh họa giả định, không phải dự báo đã kiểm chứng. Mỗi chỉ số được cộng mức thay đổi độc lập; không mô phỏng quan hệ vật lý giữa cây xanh, nhiệt độ và độ khô." />
      {admin ? (
        <Card><View style={{gap: 14}}>
          <Eyebrow>Tạo mới</Eyebrow><T w={800} s={24} ls={-0.02}>Tạo và lưu một lần chạy</T>
          <Field label="Tên kịch bản"><Input value={title} onChangeText={setTitle} maxLength={150} accessibilityLabel="Tên kịch bản" /></Field>
          <Field label="Năm cơ sở"><Select label="Năm cơ sở" value={base} onChange={setBase} options={YEARS.map(y => ({value: String(y), label: String(y)}))} /></Field>
          <Field label="Năm gắn nhãn kịch bản"><Input value={target} onChangeText={setTarget} keyboardType="number-pad" accessibilityLabel="Năm gắn nhãn" /></Field>
          <T s={12} color={C.ink3}>Chỉ là nhãn; không có nghĩa đã tải ảnh năm đó.</T>
          <SliderField label="Thay đổi nhiệt độ" min={-10} max={10} step={0.1} value={d.lst} onChange={v => setD(s => ({...s, lst: v}))} unit="°C" digits={1} />
          <SliderField label="Thay đổi độ xanh" min={-1} max={1} step={0.01} value={d.ndvi} onChange={v => setD(s => ({...s, ndvi: v}))} unit="" digits={2} />
          <SliderField label="Thay đổi độ khô" min={-1} max={1} step={0.01} value={d.tvdi} onChange={v => setD(s => ({...s, tvdi: v}))} unit="" digits={2} />
          <Field label="Độ phủ hiện trạng tối thiểu"><Select label="Độ phủ tối thiểu" value={cov} onChange={setCov} options={[{value: '0.5', label: '50%'}, {value: '0.8', label: '80%'}, {value: '0.1', label: '10% · thận trọng'}]} /></Field>
          <T s={12.5} lh={1.5} color={C.ink3}>Dữ liệu cơ sở thiếu hoặc độ phủ thấp sẽ để trống. Giá trị vượt miền hợp lệ được chặn và đánh dấu.</T>
          <Button tone="primary" icon="flask" label="Tạo giả lập và lưu" disabled={busy} onPress={submit} />
          {status ? <T s={13} lh={1.5}>{status}</T> : null}
        </View></Card>
      ) : (
        <Card><View style={{gap: 10}}><T w={800} s={22}>Chỉ quản trị viên được tạo giả lập</T><T s={14} lh={1.5} color={C.ink3}>Mỗi lần chạy được ghi vào cơ sở dữ liệu nên cần tài khoản quản trị. Bạn vẫn xem được các kết quả đã lưu ở bên dưới.</T><Button tone="primary" label="Đăng nhập" onPress={() => router.navigate('/dang-nhap' as any)} /></View></Card>
      )}
      <Block title="Lịch sử kết quả">
        {err ? <Callout tone="err">{err}</Callout> : null}
        {!runs.length ? <Callout>Chưa có lần chạy nào. Quản trị viên có thể tạo kịch bản ở trên.</Callout> : <>
          <Field label="Lần chạy"><Select label="Chọn lần chạy" value={runId} onChange={id => { setRunId(id); loadRun(id); }} options={runs.map(r => ({value: r.id, label: `${r.result_kind === 'simulation' ? 'GIẢ LẬP' : 'DỰ BÁO'} · ${r.title} · ${r.base_year}→${r.target_year}`}))} /></Field>
          {result && <>
            <T s={12.5} lh={1.5}>{`${result.run.result_kind === 'simulation' ? 'GIẢ LẬP' : 'DỰ BÁO'} · cơ sở: ${result.run.source_dataset_id}, ${result.run.base_year} · nhãn: ${result.run.target_year} · ${result.run.method === 'independent_offsets' ? 'cộng mức thay đổi độc lập' : result.run.method} ${result.run.method_version} · ${new Date(result.run.created_at).toLocaleString('vi-VN')}${result.run.note ? ' · ' + result.run.note : ''}`}</T>
            <View style={{gap: 10}}>{INDICES.map(k => {
              const pairs = result.units.map(u => [baseline?.get(u.code, result.run.base_year)?.[k], u[k]] as const).filter(([a, b]) => valid(a) && valid(b)), n = pairs.length;
              const a = n ? pairs.reduce((s, p) => s + (p[0] as number), 0) / n : null, b = n ? pairs.reduce((s, p) => s + (p[1] as number), 0) / n : null, idx = INDEX[k], delta = valid(a) && valid(b) ? b - a : null;
              return <View key={k} style={{backgroundColor: '#fff', borderWidth: BW, borderColor: C.ink, borderRadius: 14, padding: 14, gap: 3}}><Eyebrow>{idx.label}</Eyebrow><CountUp value={b} format={v => fmt(v, idx.digits)} mono w={800} s={26} /><T mono s={12} color={C.ink2}>{valid(a) ? `cơ sở ${fmt(a, idx.digits)} → ${valid(delta) ? (delta > 0 ? '+' : '') + fmt(delta, idx.digits) : '—'} ${idx.unit}`.trim() : 'thiếu mẫu cơ sở'}</T><T s={12} color={C.ink3}>{`${n} khu vực`}</T></View>;
            })}</View>
            <Table minWidth={900} rowKey={u => u.code + u.year} rows={result.units} cols={[
              {key: 'name', label: 'Khu vực', width: 170, render: (u: Unit) => <T w={700} s={13}>{u.name}</T>}, {key: 'year', label: 'Năm', width: 64, num: true, render: (u: Unit) => <T mono s={13}>{String(u.year)}</T>},
              ...INDICES.flatMap(k => [{key: k + 'b', label: INDEX[k].label + ' cơ sở', width: 100, num: true, render: (u: Unit) => <T mono s={13}>{fmt(baseline?.get(u.code, result.run.base_year)?.[k], INDEX[k].digits)}</T>}, {key: k + 'r', label: INDEX[k].label + ' kết quả', width: 110, num: true, render: (u: Unit) => <T mono w={800} s={13}>{fmt(u[k], INDEX[k].digits)}</T>}]),
              {key: 'st', label: 'Trạng thái', width: 170, render: (u: Unit) => { const sts = [u.lst_status, u.ndvi_status, u.tvdi_status], w = sts.includes('insufficient_base_coverage') ? 'insufficient_base_coverage' : sts.includes('clipped') ? 'clipped' : 'simulated'; return <Tag tone={STATUS[w][0]}>{STATUS[w][1]}</Tag>; }},
            ]} />
            <View style={{flexDirection: 'row'}}><Button sm icon="download" label="Xuất CSV kết quả" onPress={exportCsv} /></View>
          </>}
        </>}
        <T s={12} lh={1.45} color={C.ink3}>CSDL có thể lưu RMSE/MAE/Bias của một mô hình đã kiểm định. Bản này chỉ có giả lập; không tạo số đánh giá độ chính xác khi chưa có dữ liệu đối chứng.</T>
      </Block>
      <View style={{height: 30}} />
    </Page>
  );
}
