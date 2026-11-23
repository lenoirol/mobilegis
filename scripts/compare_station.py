"""Đối chiếu LST (Landsat, nhiệt độ BỀ MẶT) với nhiệt độ KHÔNG KHÍ đo tại trạm Tân Sơn Nhất (WMO 48900) đúng ngày và giờ vệ tinh chụp.

    .venv/bin/python scripts/compare_station.py

Nguồn trạm: Meteostat, số liệu theo giờ (data/station/meteostat_48900_hourly.csv.gz, giờ UTC). Landsat qua TP.HCM khoảng 03:10 UTC (10:10 giờ Việt Nam),
nên nhiệt độ không khí lấy nội suy tuyến tính giữa 03:00 và 04:00 UTC theo phút chụp danh định 03:10.
LST tại trạm = trung bình các ô 120 m hợp lệ trong cửa sổ 3 × 3 ô quanh trạm (khoảng 360 m), từ ảnh đã công bố của từng năm (ảnh đã lấp ô thiếu nếu có).
Mỗi năm ảnh là ghép của vài cảnh; ngày dùng để so là ngày chụp của cảnh phủ ô quanh trạm, lấy từ danh sách ngày ảnh của phường chứa trạm.
Đây là phép đối chiếu để hiểu khác biệt giữa hai đại lượng, KHÔNG phải hiệu chỉnh hay kiểm định độ chính xác của LST.
"""
import csv, gzip, json, sys
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
import numpy as np
import rasterio
from rasterio.warp import transform as warp

STATION = {'name': 'Tân Sơn Nhất', 'wmo': '48900', 'lat': 10.8188, 'lon': 106.6520}   # tọa độ sân bay (VVTS)
RASTERS = {2020: 'data/gee_recovery/fill_2020_hocmon_20261123/indices_2020_fill_120m.tif', 2021: 'data/gee/rasters/indices_2021_120m.tif',
           2022: 'data/gee_recovery/fill_2022_20261104/indices_2022_fill_120m.tif', 2023: 'data/gee_recovery/fill_2023_20261104/indices_2023_fill_120m.tif',
           2024: 'data/gee/rasters/indices_2024_120m.tif', 2025: 'data/gee_recovery/batch3_20261102_review/indices_2025_recovery_batch3_120m.tif'}
NODATA = -9999


def hourly():
    out = {}
    with gzip.open(ROOT / 'data/station/meteostat_48900_hourly.csv.gz', 'rt') as f:
        for r in csv.reader(f):
            if r[0] >= '2020-01-01' and r[0] < '2026-01-01' and r[2]:
                out[(r[0], int(r[1]))] = {'t': float(r[2]), 'rh': float(r[4]) if r[4] else None}
    return out


def air_at(h, d):
    a, b = h.get((d, 3)), h.get((d, 4))
    if a and b: return a['t'] + (b['t'] - a['t']) * 10 / 60, (a['rh'] + b['rh']) / 2 if a['rh'] and b['rh'] else None
    if a: return a['t'], a['rh']
    return None, None


def station_ward():
    """Mã xã/phường chứa trạm (để biết các ngày ảnh)."""
    from shapely.geometry import shape, Point
    geo = json.loads((ROOT / 'public/data/hcm_167.geojson').read_text(encoding='utf8'))
    p = Point(STATION['lon'], STATION['lat'])
    return next(f['properties'] for f in geo['features'] if shape(f['geometry']).contains(p))


def main():
    h = hourly(); ward = station_ward()
    rows = json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8'))
    sup = {(r['code'], r['year']): r for r in json.loads((ROOT / 'public/data/gee_recovery/supplements.json').read_text(encoding='utf8'))}
    result = []
    for year, path in RASTERS.items():
        with rasterio.open(ROOT / path) as ds:
            xs, ys = warp('EPSG:4326', ds.crs, [STATION['lon']], [STATION['lat']])
            r, c = ds.index(xs[0], ys[0])
            win = ds.read(2, window=((r - 1, r + 2), (c - 1, c + 2))).astype(float)   # bảng 2 = LST
        win[win == NODATA] = np.nan
        lst = float(np.nanmean(win)) if np.isfinite(win).any() else None
        wr = sup.get((ward['code'], year)) or next((x for x in rows if x['code'] == ward['code'] and x['year'] == year), {})
        dates = sorted(wr.get('dates') or [])
        airs = [(d, *air_at(h, d)) for d in dates]
        airs = [a for a in airs if a[1] is not None]
        tair = float(np.mean([a[1] for a in airs])) if airs else None
        result.append({'year': year, 'dates': dates, 'lst_station_3x3': None if lst is None else round(lst, 2), 'valid_pixels': int(np.isfinite(win).sum()),
                       'ward_lst': wr.get('lst'), 'air_temp_10h': None if tair is None else round(tair, 1),
                       'air_by_date': [{'date': d, 't': round(t, 1), 'rh': None if rh is None else round(rh)} for d, t, rh in airs],
                       'diff_lst_minus_air': None if (lst is None or tair is None) else round(lst - tair, 1)})
    diffs = [r['diff_lst_minus_air'] for r in result if r['diff_lst_minus_air'] is not None]
    doc = {'station': {**STATION, 'ward': ward['full_name'], 'source': 'Meteostat, số liệu theo giờ trạm 48900', 'url': 'https://meteostat.net/en/station/48900'},
           'method': 'LST trung bình 3×3 ô 120 m quanh trạm; nhiệt độ không khí nội suy 03:10 UTC (10:10 giờ VN) vào các ngày ảnh của phường chứa trạm.',
           'years': result, 'mean_diff': round(float(np.mean(diffs)), 1) if diffs else None, 'min_diff': min(diffs) if diffs else None, 'max_diff': max(diffs) if diffs else None,
           'caveat': 'So sánh hai đại lượng khác nhau (bề mặt và không khí cao 2 m); không dùng để hiệu chỉnh LST. Một năm có thể có nhiều ngày ảnh trong phường, nhiệt độ trạm là trung bình các ngày đó.'}
    (ROOT / 'verification').mkdir(exist_ok=True)
    (ROOT / 'verification/LST_TRAM_TAN_SON_NHAT.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf8')
    (ROOT / 'public/data/station_compare.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(json.dumps({k: doc[k] for k in ('mean_diff', 'min_diff', 'max_diff')}, ensure_ascii=False))
    for r in result: print(r['year'], r['dates'], 'LST', r['lst_station_3x3'], f"({r['valid_pixels']} ô)", 'không khí', r['air_temp_10h'], 'chênh', r['diff_lst_minus_air'])
    print('Phường chứa trạm:', ward['full_name'])


if __name__ == '__main__':
    main()
