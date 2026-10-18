"""Evidence for the thesis test chapter (proposal sections 6.7 and 7.7), generated from the real data.

1. `cross-check`: recompute zonal means of 10 communes x 6 years x 3 indices straight from the GEE GeoTIFFs and the
   uploaded boundary shapefile, then compare them with the values the app serves (PostgreSQL through the API code path).
   Writes kiem_thu/DOI_CHIEU_10_DON_VI.csv.
2. `perf`: time the first map paint and a layer switch in headless Chrome on THIS machine (localhost, not Wi-Fi or mobile
   data) at two phone sizes. Writes kiem_thu/DO_HIEU_NANG_LOCALHOST.csv. Real-device numbers must be measured by the team.

    .venv/bin/python scripts/make_test_report.py cross-check
    MOBILEGIS_URL=http://127.0.0.1:5379 .venv/bin/python scripts/make_test_report.py perf
"""
import csv, os, statistics, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / 'kiem_thu'
UNITS = {'26743': 'Phường Bến Thành (đô thị trung tâm)', '27265': 'Phường Khánh Hội (đô thị, ven sông)', '27442': 'Phường Bình Tân (đô thị, công nghiệp)',
         '25747': 'Phường Thủ Dầu Một (đô thị Bình Dương)', '25888': 'Phường Tân Uyên (công nghiệp, Bình Dương)', '26983': 'Phường Bảy Hiền (nội đô)',
         '27511': 'Xã Nhuận Đức (nông nghiệp, Củ Chi)', '26575': 'Xã Ngãi Giao (nông nghiệp, Bà Rịa)', '27664': 'Xã Cần Giờ (rừng ngập mặn, ven biển)',
         '27673': 'Xã An Thới Đông (rừng ngập mặn, Cần Giờ)'}
DIGITS = {'lst': 1, 'ndvi': 2, 'tvdi': 2}   # precision shown in the app


def cross_check():
    import numpy as np, rasterio, shapefile
    from rasterio.features import geometry_mask, geometry_window
    from rasterio.warp import transform_geom
    from rasterio.windows import Window
    import database as db
    app = {(r['code'], r['year']): r for r in db.observations('gee_recovery')}
    reader = shapefile.Reader(str(ROOT / 'data/gee_boundary/hcm167_GEE.zip'), encoding='utf-8')
    geoms = {str(r.record['code']).zfill(5): r.shape.__geo_interface__ for r in reader.iterShapeRecords()}
    rows = []
    for year in range(2020, 2026):
        with rasterio.open(ROOT / f'data/gee/rasters/indices_{year}_120m.tif') as src:
            for code in UNITS:
                geom = transform_geom('EPSG:4326', src.crs, geoms[code])
                win = geometry_window(src, [geom]).intersection(Window(0, 0, src.width, src.height))
                arr = src.read(window=win)
                inside = geometry_mask([geom], out_shape=arr.shape[1:], transform=src.window_transform(win), invert=True)
                row = app[(code, year)]
                for i, key in enumerate(('ndvi', 'lst', 'tvdi')):
                    values = arr[i][inside]; values = values[np.isfinite(values) & (values != -9999.0)]
                    expected = float(values.astype('float64').mean()) if values.size >= 5 else None
                    shown = row.get(key)
                    diff = None if expected is None or shown is None else abs(expected - shown)
                    same_display = (expected is None and shown is None) or (diff is not None and round(expected, DIGITS[key]) == round(shown, DIGITS[key]))
                    rows.append({'code': code, 'unit': UNITS[code], 'year': year, 'index': key, 'geotiff_mean': None if expected is None else round(expected, 6), 'app_value': None if shown is None else round(shown, 6),
                                 'abs_diff': None if diff is None else f'{diff:.2e}', 'valid_pixels_geotiff': int(values.size), 'valid_pixels_app': row.get(key + '_pixels'),
                                 'same_at_display_precision': same_display, 'recovery_pixels': row.get('recovery_pixels') or 0})
    OUT.mkdir(exist_ok=True)
    with (OUT / 'DOI_CHIEU_10_DON_VI.csv').open('w', encoding='utf-8-sig', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    bad = [r for r in rows if not r['same_at_display_precision'] or r['valid_pixels_geotiff'] != r['valid_pixels_app']]
    worst = max((float(r['abs_diff']) for r in rows if r['abs_diff']), default=0)
    print(f'{len(rows)} phép so sánh, {len(rows) - len(bad)} khớp ở độ chính xác hiển thị và số ô; sai khác tuyệt đối lớn nhất {worst:.2e}')
    for r in bad[:10]:
        print('LỆCH', r['code'], r['year'], r['index'], r['geotiff_mean'], r['app_value'], r['valid_pixels_geotiff'], r['valid_pixels_app'], 'recovery', r['recovery_pixels'])
    return not bad


def perf():
    from playwright.sync_api import sync_playwright
    url = os.environ.get('MOBILEGIS_URL', 'http://127.0.0.1:5379')
    sizes = {'Điện thoại nhỏ 360x740': (360, 740), 'Điện thoại lớn 412x915': (412, 915)}
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        for label, (w, h) in sizes.items():
            first, switch = [], []
            for _ in range(5):
                context = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
                page = context.new_page(); start = time.perf_counter()
                page.goto(url + '/#/ban-do'); page.wait_for_selector('#splash', state='detached', timeout=30000); page.wait_for_selector('button.metric', timeout=30000)
                page.wait_for_load_state('networkidle'); first.append(time.perf_counter() - start)
                start = time.perf_counter(); page.tap('button.metric[data-index=ndvi]'); page.wait_for_function("location.hash.includes('chi-so=ndvi')"); page.wait_for_load_state('networkidle'); switch.append(time.perf_counter() - start)
                context.close()
            rows.append({'kich_thuoc': label, 'lan_do': len(first), 'ban_do_dau_tien_trung_vi_giay': round(statistics.median(first), 2), 'ban_do_dau_tien_lon_nhat_giay': round(max(first), 2),
                         'doi_lop_trung_vi_giay': round(statistics.median(switch), 2), 'doi_lop_lon_nhat_giay': round(max(switch), 2), 'moi_truong': 'localhost, Chrome không giới hạn mạng'})
        browser.close()
    OUT.mkdir(exist_ok=True)
    with (OUT / 'DO_HIEU_NANG_LOCALHOST.csv').open('w', encoding='utf-8-sig', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    for r in rows: print(r)
    return True


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'cross-check'
    sys.exit(0 if {'cross-check': cross_check, 'perf': perf}[mode]() else 1)
