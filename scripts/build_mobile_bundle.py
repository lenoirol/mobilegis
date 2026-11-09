"""Đóng gói số liệu sẵn vào app Android/iPhone (mobile/assets/data) để app mở ngay, chạy được khi mất mạng.

    .venv/bin/python scripts/build_mobile_bundle.py

- Ranh giới 167 xã/phường được làm gọn (mapshaper, giữ hình, ~30% số đỉnh) và chỉ giữ các thuộc tính app cần.
- Số liệu = observations.json đã công bố + các đợt bổ sung đã kiểm tra (supplements.json), giống bản web.
- Dự báo tháng = public/data/forecast/forecast.json.
App vẫn tải bản mới nhất từ mạng khi có kết nối; tệp đóng gói chỉ là bản dự phòng mở nhanh.
"""
import json, subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'mobile/assets/data'
KEEP = ('code', 'name', 'year', 'sampled_pixels', 'dates', 'lst', 'lst_coverage', 'ndvi', 'ndvi_coverage', 'tvdi', 'tvdi_coverage', 'supplement')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        simple = Path(tmp) / 'b.json'
        subprocess.run(['npx', '-y', 'mapshaper@0.6.102', str(ROOT / 'public/data/hcm_167.geojson'), '-simplify', '30%', 'keep-shapes', 'planar',
                        '-clean', '-o', 'precision=0.00001', 'format=geojson', str(simple)], check=True, capture_output=True)
        geo = json.loads(simple.read_text(encoding='utf8'))
    for f in geo['features']:
        p = f['properties']; f['id'] = p['code']
        f['properties'] = {k: p[k] for k in ('code', 'name', 'full_name', 'lat', 'lon')}
    (OUT / 'boundaries.json').write_text(json.dumps(geo, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    rows = json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8'))
    extra = json.loads((ROOT / 'public/data/gee_recovery/supplements.json').read_text(encoding='utf8'))
    at = {(r['code'], r['year']): i for i, r in enumerate(rows)}
    for r in extra:
        i = at.get((r['code'], r['year']))
        if i is None: rows.append(r)
        else: rows[i] = r
    compact = [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items() if k in KEEP and v is not None} for r in rows]
    (OUT / 'rows.json').write_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    fc = ROOT / 'public/data/forecast/forecast.json'
    (OUT / 'forecast.json').write_text(fc.read_text(encoding='utf8'), encoding='utf8')
    for p in sorted(OUT.iterdir()): print(p.name, round(p.stat().st_size / 1024), 'KB')

if __name__ == '__main__':
    main()
