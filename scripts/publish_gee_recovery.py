"""Publish the validated recovery as an independent source; baseline stays immutable."""
import copy, csv, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import features, sha, NODATA
from build_visual_products import tiles, query_grid, write_json
from build_landsat import PALETTES

def publish():
    review_dir = ROOT / 'data/gee_recovery/batch1_20261004'
    report = json.loads((review_dir / 'review.json').read_text(encoding='utf8'))
    baseline = ROOT / 'data/gee/rasters/indices_2025_120m.tif'
    assert sha(baseline) == report['baseline_sha256'], 'Baseline changed since review'
    for f in report['input_files']:
        assert sha(review_dir / 'originals' / f['file']) == f['sha256']
    raster = review_dir / 'indices_2025_recovery_batch1_120m.tif'
    computed = json.loads((review_dir / 'observations_2025_review.json').read_text(encoding='utf8'))
    rows = json.loads((ROOT / 'public/data/gee/observations.json').read_text(encoding='utf8'))
    product = json.loads((ROOT / 'public/data/gee/products.json').read_text(encoding='utf8'))
    product = copy.deepcopy(product)
    targets = {r['code'] for r in report['wards']}
    by_code = {r['code']: r for r in computed}
    scenes = {int(s['scene_index']): s for s in report['scenes']}
    units = features()
    with rasterio.open(raster) as ds, rasterio.open(baseline) as original, rasterio.open(review_dir / 'provenance_2025_120m.tif') as provenance:
        arrays = ds.read(); old = original.read(); prov = provenance.read(1)
        assert np.array_equal(old[old != NODATA], arrays[old != NODATA])
        for row in rows:
            if row['year'] != 2025: continue
            if row['code'] not in targets:
                for key, value in by_code[row['code']].items(): assert row[key] == value
                continue
            row.update(by_code[row['code']])
            geom = next(g for c, _, g in units if c == row['code'])
            mask = geometry_mask([transform_geom(4326, ds.crs, geom)], out_shape=ds.shape, transform=ds.transform, invert=True)
            used = sorted(int(i) for i in np.unique(prov[mask]) if i > 0)
            row['recovery_scene_ids'] = [scenes[i]['LANDSAT_PRODUCT_ID'] for i in used]
            row['recovery_dates'] = sorted({scenes[i]['acquisition_date'] for i in used})
            row['recovery_pixels'] = int(((prov > 0) & mask).sum())
            row['dates'] = sorted(set(row['dates']) | set(row['recovery_dates']))
            row['scene_ids'] = list(dict.fromkeys(row['scene_ids'] + row['recovery_scene_ids']))
            row['source'] += ' · bổ sung ô thiếu 2025, batch 1'
        arrays = np.where(arrays == NODATA, np.nan, arrays)
        first_path = ROOT / 'data/gee/rasters/indices_2020_120m.tif'
        with rasterio.open(first_path) as first:
            assert first.transform == ds.transform and first.shape == ds.shape
            a = first.read(); a = np.where(a == NODATA, np.nan, a)
        product['absolute']['2025'] = {}
        for i, key in enumerate(('ndvi', 'lst', 'tvdi')):
            lo, hi, colors = PALETTES[key]
            prefix = f'gee_recovery_{key}_2025'
            product['absolute']['2025'][key] = tiles(arrays[i], ds.transform, ds.crs, prefix, lo=lo, hi=hi, colors=colors)
            product['query'][key + '_2025'] = query_grid(arrays[i], ds.transform, prefix)
            delta = arrays[i] - a[i]
            limit = {'lst': 10, 'ndvi': .3, 'tvdi': .4}[key]
            out = review_dir / f'change_{key}_2020_2025_120m.tif'
            profile = ds.profile.copy(); profile.update(count=1)
            with rasterio.open(out, 'w', **profile) as dst:
                dst.write(np.where(np.isfinite(delta), delta, NODATA).astype('float32'), 1)
                dst.set_band_description(1, 'delta_' + key)
            product['change'][key] = {**tiles(delta, ds.transform, ds.crs, f'gee_recovery_change_{key}_2020_2025', lo=-limit, hi=limit, colors=['#2171b5', '#f7f7f7', '#c53a32']), 'from': 2020, 'to': 2025, 'min': -limit, 'max': limit, 'valid_pairs': int(np.isfinite(delta).sum()), 'note': 'GEE 2020 vs gap-only recovered 2025; different scene dates, not causal.'}
            product['query']['change_' + key] = query_grid(delta, ds.transform, 'gee_recovery_change_' + key)
        product['baseline_2025_audit'] = copy.deepcopy(product['audits']['2025'])
        audit = product['audits']['2025']
        audit['method'] = report['method']
        audit['valid_means'] = {k: sum(r[k] is not None for r in computed) for k in ('ndvi', 'lst', 'tvdi')}
        audit['missing_units'] = {k: [r['name'] for r in computed if r[k] is None] for k in ('ndvi', 'lst', 'tvdi')}
        audit['finite_pixels'] = {k: int(np.isfinite(arrays[i]).sum()) for i, k in enumerate(('ndvi', 'lst', 'tvdi'))}
        audit['scenes'] += report['scenes']
        audit['raster'] = '/api/gee_recovery/rasters/' + raster.name
        audit['original_files'] += [{**f, 'download': '/api/gee_recovery/originals/' + f['file']} for f in report['input_files']]
        # Old source-CSV differences do not describe the recovered result.
        audit.pop('mean_differences', None)
    product.update(source_id='gee_recovery', version='2026.10.GEE7', recovery=report)
    product['recovery']['status'] = 'published_separate_source'
    public = ROOT / 'public/data/gee_recovery'
    write_json(public / 'products.json', product)
    write_json(public / 'observations.json', rows)
    with (public / 'observations.csv').open('w', encoding='utf-8-sig', newline='') as f:
        fields = list(dict.fromkeys(k for r in rows for k in r))
        writer = csv.DictWriter(f, fieldnames=fields); writer.writeheader()
        for r in rows: writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, list) else v for k, v in r.items()})
    write_json(ROOT / 'verification/GEE_2025_recovery_published.json', {'filled_pixels': report['filled_pixels'], 'valid_means': audit['valid_means'], 'baseline_sha256': sha(baseline), 'recovered_sha256': sha(raster), 'wards': report['wards'], 'per_scene_filled_pixels': report['per_scene_filled_pixels'], 'change_valid_pairs': {k: v['valid_pairs'] for k, v in product['change'].items()}})
    print(json.dumps({'published': product['source_id'], 'valid_means': audit['valid_means'], 'filled_pixels': report['filled_pixels']}))

if __name__ == '__main__': publish()
