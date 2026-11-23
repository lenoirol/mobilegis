"""Tạo lại ảnh ô 120 m (tile PNG) và lưới tra cứu điểm cho các năm đã bổ sung ô thiếu, để lớp "Ô 120 m" khớp với số liệu xã/phường.

    .venv/bin/python scripts/publish_fill_tiles.py

- 2025: ảnh sau đợt 3 (data/gee_recovery/batch3_20261102_review), đã gồm đợt 1 và 2.
- 2020, 2022, 2023: ảnh đã lấp (data/gee_recovery/fill_<năm>_20261104).
Không sửa ảnh gốc và không xóa ô ảnh cũ: ô mới ghi vào thư mục tên mới (gee_fill_<chỉ số>_<năm>), products.json trỏ sang đó.
Trước khi dùng, kiểm tra mọi giá trị hữu hạn của ảnh gốc năm đó được giữ nguyên (chỉ ô trống mới được lấp).
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
import rasterio
from import_gee import NODATA, sha
from build_visual_products import tiles, query_grid, write_json
from build_landsat import PALETTES

FILLED = {
    2025: ROOT / 'data/gee_recovery/batch3_20261102_review/indices_2025_recovery_batch3_120m.tif',
    2020: ROOT / 'data/gee_recovery/fill_2020_20261104/indices_2020_fill_120m.tif',
    2022: ROOT / 'data/gee_recovery/fill_2022_20261104/indices_2022_fill_120m.tif',
    2023: ROOT / 'data/gee_recovery/fill_2023_20261104/indices_2023_fill_120m.tif',
}
KEYS = ('ndvi', 'lst', 'tvdi')


def load(path):
    with rasterio.open(path) as ds:
        a = ds.read(list(range(1, 4))).astype('float32')
        return np.where(a == NODATA, np.nan, a), ds.transform, ds.crs, ds.shape


def main():
    public = ROOT / 'public/data/gee_recovery/products.json'
    product = json.loads(public.read_text(encoding='utf8'))
    report = {}
    for year, path in sorted(FILLED.items()):
        arr, transform, crs, shape = load(path)
        base, bt, _, bshape = load(ROOT / f'data/gee/rasters/indices_{year}_120m.tif')
        assert bt == transform and bshape == shape, f'{year}: lệch lưới với ảnh gốc'
        kept = np.isfinite(base)
        assert np.allclose(arr[kept], base[kept]), f'{year}: ảnh bổ sung làm đổi giá trị của ảnh gốc'
        report[year] = {'raster': str(path.relative_to(ROOT)), 'sha256': sha(path)}
        for i, k in enumerate(KEYS):
            lo, hi, colors = PALETTES[k]
            prefix = f'gee_fill_{k}_{year}'
            meta = tiles(arr[i], transform, crs, prefix, lo=lo, hi=hi, colors=colors, force=True)
            product['absolute'][str(year)][k] = {**meta, 'filled': True}
            product['query'][f'{k}_{year}'] = query_grid(arr[i], transform, prefix)
            report[year][k] = {'pixels_before': int(np.isfinite(base[i]).sum()), 'pixels_after': int(np.isfinite(arr[i]).sum())}
    # Lớp thay đổi 2020 → 2025 tính lại từ hai ảnh đã bổ sung
    a20, t20, crs, _ = load(FILLED[2020]); a25, _, _, _ = load(FILLED[2025])
    for i, k in enumerate(KEYS):
        delta = a25[i] - a20[i]; limit = {'lst': 10, 'ndvi': .3, 'tvdi': .4}[k]
        prefix = f'gee_fill_change_{k}_2020_2025'
        product['change'][k] = {**tiles(delta, t20, crs, prefix, lo=-limit, hi=limit, colors=['#2171b5', '#f7f7f7', '#c53a32'], force=True),
                                'from': 2020, 'to': 2025, 'min': -limit, 'max': limit, 'valid_pairs': int(np.isfinite(delta).sum()),
                                'note': 'GEE 2020 và 2025 sau khi lấp ô thiếu; ngày ảnh khác nhau, không phải quan hệ nhân quả.'}
        product['query']['change_' + k] = query_grid(delta, t20, prefix)
    product['tiles_filled'] = {'note': 'Ô 120 m của 2020, 2022, 2023, 2025 được tạo lại từ ảnh đã lấp ô thiếu; giá trị của ảnh gốc giữ nguyên.', 'years': report}
    write_json(public, product)
    write_json(ROOT / 'verification/GEE_fill_tiles.json', report)
    print(json.dumps({y: {k: v[k] for k in KEYS} for y, v in report.items()}, indent=1))


if __name__ == '__main__':
    main()
