"""Plan GEE recovery batch 2 for 2025 (read-only).

Counts, per unit, how many pixel centres of the PUBLISHED 2025 recovery raster have NO valid LST/NDVI/TVDI value at all
(the only pixels a gap-only recovery may fill) and selects the units where those make up at least --min-missing of the unit.
Writes verification/GEE_2025_batch2_targets.json and prints the target list to paste into scripts/gee_recover_2025_batch2.js.
Changes no data file.

    python scripts/plan_gee_batch2.py [--min-missing 0.10]
"""
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import features, read_csv, sha, NODATA

RECOVERY = ROOT / 'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif'
BATCH1_SCENES = ROOT / 'data/gee_recovery/batch1_20261004/originals/MobileGIS_recovery_2025_batch1_scenes.csv'
BASE_SCENES = ROOT / 'data/gee/originals/MobileGIS_scenes_2025.csv'
EXCLUDED_CODE = '26732'   # Côn Đảo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--min-missing', type=float, default=0.10, help='target units whose fully-empty pixels are at least this share (default 0.10)')
    args = parser.parse_args()
    rows = {r['code']: r for r in json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8')) if r['year'] == 2025}
    with rasterio.open(RECOVERY) as ds:
        data = ds.read()
        triplet_valid = ((data != NODATA) & np.isfinite(data)).all(axis=0)
        any_valid = ((data != NODATA) & np.isfinite(data)).any(axis=0)
        report = []
        for code, name, geometry in features():
            if code == EXCLUDED_CODE or code not in rows:
                continue
            row = rows[code]
            coverage = min(row[k + '_coverage'] for k in ('lst', 'ndvi', 'tvdi'))
            mask = geometry_mask([transform_geom('EPSG:4326', ds.crs, geometry)], out_shape=ds.shape, transform=ds.transform, invert=True)
            total = int(mask.sum())
            missing = int((mask & ~any_valid).sum())     # nothing valid: fillable
            if not total or missing / total < args.min_missing:
                continue
            report.append({'code': code, 'name': name, 'sampled_pixels': total, 'coverage_min': round(coverage, 4), 'missing_triplets': missing,
                           'missing_share': round(missing / total, 4),
                           'partial_pixels_kept': int((mask & any_valid & ~triplet_valid).sum()),  # some bands valid: never overwritten
                           'now_valid_triplets': int((mask & triplet_valid).sum())})
    report.sort(key=lambda r: -r['missing_share'])
    used = [r['LANDSAT_PRODUCT_ID'] for r in read_csv(BASE_SCENES)] + [r['LANDSAT_PRODUCT_ID'] for r in read_csv(BATCH1_SCENES)]
    output = {'year': 2025, 'purpose': 'GEE recovery batch 2 (gap-only, same season, same QA)', 'min_missing_share': args.min_missing, 'recovery_raster_sha256': sha(RECOVERY),
              'targets': report, 'target_codes': [r['code'] for r in report], 'already_used_scene_ids': used,
              'max_fillable_triplets': int(sum(r['missing_triplets'] for r in report)),
              'note': 'Counts are on the published 120 m grid with pixel-centre rule. A fill needs a NEW Jan–Apr 2025 L2SP scene whose LST, NDVI and TVDI are all valid at that pixel; many gaps may stay empty.'}
    (ROOT / 'verification/GEE_2025_batch2_targets.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf8')
    print(f"{len(report)} khu vực có ≥ {args.min_missing:.0%} ô trống hoàn toàn; tối đa {output['max_fillable_triplets']:,} ô có thể được bổ sung.\n")
    print(f"{'Khu vực':28} {'mã':6} {'tổng ô':>7} {'phủ':>6} {'ô trống':>8} {'tỷ lệ':>6}")
    for r in report:
        print(f"{r['name']:28} {r['code']:6} {r['sampled_pixels']:7} {r['coverage_min']:6.0%} {r['missing_triplets']:8} {r['missing_share']:6.0%}")
    print('\nTARGET_CODES = ' + json.dumps(output['target_codes']) + ';')
    print('Cảnh đã dùng (loại khỏi đợt 2):')
    for i in used:
        print('  ', i)


if __name__ == '__main__':
    main()
