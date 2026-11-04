"""Xuất các đợt bổ sung số liệu (CSV "Nhập số liệu" đã kiểm tra) thành public/data/gee_recovery/supplements.json cho bản web TĨNH.

Bản đầy đủ (máy chủ + CSDL) đã ghép lớp phủ nhập số liệu ngay khi phục vụ; bản tĩnh (GitHub Pages) không có CSDL nên
đọc tệp này để hiện cùng số liệu. Tệp số liệu gốc observations.json KHÔNG bị sửa; mỗi dòng ghi rõ đợt bổ sung.

    .venv/bin/python scripts/export_static_supplements.py
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import observation_imports as oi

BATCHES = [   # (nhãn, tệp CSV) theo thứ tự áp dụng; dòng sau ghi đè dòng trước
    ('Bổ sung GEE 2025 · đợt 2', 'data/gee_recovery/batch2_20261101_review/nhap_so_lieu_dot2.csv'),
    ('Bổ sung GEE 2025 · đợt 3', 'data/gee_recovery/batch3_20261102_review/nhap_so_lieu_dot3.csv'),
    ('Bổ sung GEE 2020', 'data/gee_recovery/fill_2020_20261104/nhap_so_lieu_2020.csv'),
    ('Bổ sung GEE 2022', 'data/gee_recovery/fill_2022_20261104/nhap_so_lieu_2022.csv'),
    ('Bổ sung GEE 2023', 'data/gee_recovery/fill_2023_20261104/nhap_so_lieu_2023.csv'),
]

def main():
    geo = json.loads((ROOT / 'public/data/hcm_167.geojson').read_text(encoding='utf8'))
    codes = {f['properties']['code'] for f in geo['features']}
    names = {f['properties']['code']: f['properties'].get('full_name') or f['properties'].get('name') for f in geo['features']}
    published = {(r['code'], r['year']): r for r in json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8'))}
    merged = {}
    for label, rel in BATCHES:
        rows, errors = oi.parse((ROOT / rel).read_text(encoding='utf-8-sig'), codes)
        if errors:
            sys.exit(f'{rel}: ' + '; '.join(errors[:5]))
        for change in rows:
            key = (change['code'], change['year'])
            row = oi.merge_row(merged.get(key) or published.get(key), change, None, names)
            row['admin_import'] = True
            row['supplement'] = label
            row['source'] = str(row.get('source', '')).split(' · bổ sung')[0] + f' · bổ sung ({label})'
            merged[key] = row
    out = sorted(merged.values(), key=lambda r: (r['year'], r['code']))
    path = ROOT / 'public/data/gee_recovery/supplements.json'
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf8')
    by_year = {}
    for r in out: by_year[r['year']] = by_year.get(r['year'], 0) + 1
    print('Đã ghi', path.relative_to(ROOT), '·', len(out), 'dòng ·', by_year)

if __name__ == '__main__':
    main()
