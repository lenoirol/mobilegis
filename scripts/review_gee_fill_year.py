"""Kiểm tra ứng viên bổ sung ô thiếu của một năm (2020–2024) xuất từ scripts/gee_fill_years.js và tạo CSV "Nhập số liệu".

    .venv/bin/python scripts/review_gee_fill_year.py --year 2022 --input <thư mục chứa MobileGIS_fill_2022_*> --output data/gee_recovery/fill_2022_<ngày>

Giữ nguyên mọi giá trị đã có của ảnh gốc năm đó (data/gee/rasters/indices_<năm>_120m.tif); chỉ lấp các ô mà CẢ BA chỉ số đều trống,
trong các xã/phường mục tiêu, bằng bộ ba cùng một cảnh, cùng mùa (tháng 1–4) và không thuộc 4 cảnh của bản xuất gốc.
Không sửa dữ liệu đã công bố, không tạo lại ô ảnh 120 m; kết quả đi qua lớp phủ "Nhập số liệu" (xem trước, hoàn tác được).
"""
import argparse, csv, datetime as dt, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import NODATA, features, preserve, read_csv, sha, zonal
from review_gee_recovery import merge_gaps, valid, DESCRIPTIONS, KEYS
import observation_imports as oi


def published(year):
    rows = json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8'))
    return {r['code']: r for r in rows if r['year'] == year}


def grey_codes(year):
    return sorted(c for c, r in published(year).items() if any(not (r.get(k) is not None and (r.get(k + '_coverage') or 0) >= .5) for k in KEYS))


def review(year, folder, output):
    if output.exists():
        raise ValueError('Thư mục kết quả đã có. Dùng thư mục mới, không ghi đè một lần kiểm tra.')
    prefix = f'MobileGIS_fill_{year}'
    tif, scenes_csv = folder / f'{prefix}_120m.tif', folder / f'{prefix}_scenes.csv'
    if not (tif.is_file() and scenes_csv.is_file()):
        raise ValueError(f'Cần {tif.name} và {scenes_csv.name}')
    base_ids = {r['LANDSAT_PRODUCT_ID'] for r in read_csv(ROOT / f'data/gee/originals/MobileGIS_scenes_{year}.csv')}
    scenes = {}
    for row in read_csv(scenes_csv):
        date = dt.date.fromisoformat(row['acquisition_date'])
        if not (dt.date(year, 1, 1) <= date < dt.date(year, 5, 1)):
            raise ValueError(f'Cảnh {row["LANDSAT_PRODUCT_ID"]} ngoài mùa khô tháng 1–4/{year}')
        if row['LANDSAT_PRODUCT_ID'] in base_ids:
            raise ValueError('Ứng viên trùng với cảnh của bản xuất gốc')
        if int(float(row['year'])) != year or int(float(row['resolution_m'])) != 120:
            raise ValueError('Sai năm hoặc độ phân giải')
        scenes[int(float(row['scene_index']))] = row
    targets = set(grey_codes(year))
    baseline_path = ROOT / f'data/gee/rasters/indices_{year}_120m.tif'
    with rasterio.open(baseline_path) as base, rasterio.open(tif) as cand:
        if cand.descriptions != DESCRIPTIONS or cand.crs != base.crs or cand.transform != base.transform or cand.shape != base.shape:
            raise ValueError('Ứng viên phải cùng lưới, cùng hệ tọa độ và đúng tên 5 bảng với ảnh gốc')
        arr = cand.read().astype('float32'); baseline = base.read(); profile = base.profile.copy()
        ok = valid(arr).all(axis=0)
        if ok.any() and not set(np.unique(arr[3][ok]).astype(int)) <= set(scenes):
            raise ValueError('Chỉ số cảnh trong ảnh không khớp tệp scenes.csv')
        geoms = {code: transform_geom('EPSG:4326', base.crs, g) for code, _, g in features()}
        target_mask = geometry_mask([geoms[c] for c in targets], out_shape=base.shape, transform=base.transform, invert=True)
        merged, filled = merge_gaps(baseline, arr, target_mask)
        crs, transform, shape = base.crs, base.transform, base.shape
    if not filled.any():
        raise ValueError('Không có ô hợp lệ mới. Dữ liệu giữ nguyên.')
    output.mkdir(parents=True)
    for p in (tif, scenes_csv): preserve(p, output / 'originals' / p.name)
    merged_path = output / f'indices_{year}_fill_120m.tif'
    with rasterio.open(merged_path, 'w', **profile) as dst:
        dst.write(merged)
        for i, key in enumerate(DESCRIPTIONS[:3], 1): dst.set_band_description(i, key)
    with rasterio.open(merged_path) as ds: after = {r['code']: r for r in zonal(ds, features())}
    before = published(year)
    rows, wards = [], []
    for code in sorted(targets):
        b, a = before[code], after[code]
        mask = geometry_mask([geoms[code]], out_shape=shape, transform=transform, invert=True)
        used = sorted({int(i) for i in np.unique(arr[3][mask & filled])})
        changed = any(b.get(k + '_pixels') != a[k + '_pixels'] for k in KEYS)
        wards.append({'code': code, 'name': b['name'], 'filled_pixels': int((mask & filled).sum()),
                      'before': {k: b.get(k) for key in KEYS for k in (key, key + '_pixels', key + '_coverage')},
                      'after': {k: a[k] for key in KEYS for k in (key, key + '_pixels', key + '_coverage')},
                      'enough_at_50_percent': all((a[k + '_coverage'] or 0) >= .5 for k in KEYS)})
        if not changed:
            continue
        dates = sorted(set(b.get('dates') or []) | {scenes[i]['acquisition_date'] for i in used})
        row = {'code': code, 'year': year, 'sampled_pixels': b['sampled_pixels'], 'dates': ';'.join(dates)}
        for k in oi.INDICES:
            row[k], row[k + '_pixels'] = (round(a[k], 6) if a[k] is not None else ''), a[k + '_pixels']
        rows.append(row)
    report = {'status': 'review_only_not_published', 'year': year, 'target_codes': sorted(targets),
              'method': f'Giữ mọi giá trị hữu hạn của ảnh gốc {year}; chỉ lấp ô trống cả ba chỉ số trong các xã/phường mục tiêu bằng bộ ba cùng cảnh, tháng 1–4/{year}, không thuộc 4 cảnh gốc.',
              'filled_pixels': int(filled.sum()), 'baseline_sha256': sha(baseline_path),
              'input_files': [{'file': p.name, 'sha256': sha(p)} for p in (tif, scenes_csv)],
              'scenes': list(scenes.values()), 'wards': wards,
              'limitations': 'Ngày ảnh khác nhau và TVDI tính riêng từng cảnh. Ô ảnh 120 m không được tạo lại.'}
    (output / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf8')
    (output / f'nhap_so_lieu_{year}.csv').write_text(oi.template_csv(rows), encoding='utf-8')
    return report, rows


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--input', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    a = ap.parse_args()
    report, rows = review(a.year, a.input, a.output)
    print(json.dumps({'year': a.year, 'filled_pixels': report['filled_pixels'], 'rows': len(rows),
                      'wards': [{k: w[k] for k in ('code', 'name', 'filled_pixels', 'enough_at_50_percent')} for w in report['wards']]}, ensure_ascii=False, indent=1))
