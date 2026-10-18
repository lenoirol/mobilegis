"""Review five-band GEE candidates and create a separate, gap-only 2025 version.

Batch 1 fills five wards from the original GEE export. Batch 2 (--batch 2 --targets <json>) fills more wards starting from the
PUBLISHED batch-1 recovery raster; scene indexes of batch 2 are stored in the provenance with an offset of 10.
Never modifies the active source, original exports, or units outside the targets.
Requires the same GIS processing dependencies as import_gee.py.
"""
import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import NODATA, features, preserve, read_csv, sha, zonal

TARGETS = {'25942', '25945', '25951', '25969', '25975'}   # batch 1
BATCH1_DIR = ROOT / 'data/gee_recovery/batch1_20261004'
SCENE_OFFSET = {1: 0, 2: 10}   # provenance scene_index = candidate index + offset, so batches never collide
KEYS = ('ndvi', 'lst', 'tvdi')
DESCRIPTIONS = ('NDVI', 'LST', 'TVDI', 'scene_index', 'day_of_year')


def valid(arr):
    return np.isfinite(arr) & (arr != NODATA)


def merge_gaps(baseline, candidate, target_mask):
    """Only replace entirely missing baseline triplets within the target wards."""
    if baseline.shape[0] != 3 or candidate.shape[0] != 5 or baseline.shape[1:] != candidate.shape[1:]:
        raise ValueError('Expected same-grid three-band baseline and five-band candidates')
    eligible = target_mask & (~valid(baseline)).all(axis=0) & valid(candidate).all(axis=0)
    output = baseline.copy()
    output[:, eligible] = candidate[:3, eligible]
    assert np.array_equal(output[valid(baseline)], baseline[valid(baseline)])
    assert np.array_equal(output[:, ~target_mask], baseline[:, ~target_mask])
    return output, eligible


def validate_scenes(rows, baseline_ids, batch):
    if not 1 <= len(rows) <= 4:
        raise ValueError('Need 1–4 candidate scenes in this batch')
    indexes, identities = set(), set()
    for row in rows:
        index = int(row['scene_index'])
        date = dt.date.fromisoformat(row['acquisition_date'])
        identity = row['LANDSAT_PRODUCT_ID']
        if index not in range(1, 5) or index in indexes or identity in identities:
            raise ValueError('Duplicate or invalid scene index/product ID')
        if not (dt.date(2025, 1, 1) <= date < dt.date(2025, 5, 1)):
            raise ValueError('Only Jan–Apr 2025 candidates are accepted')
        if identity in baseline_ids or '_L2SP_' not in identity or date.strftime('%Y%m%d') not in identity:
            raise ValueError('Need a new Landsat L2SP scene matching the recorded date')
        if int(row['year']) != 2025 or int(row['recovery_batch']) != batch or int(row['resolution_m']) != 120:
            raise ValueError('Wrong year, batch, or resolution')
        if int(row['day_of_year']) != date.timetuple().tm_yday:
            raise ValueError('Day-of-year does not match acquisition date')
        if not 0 <= float(row['CLOUD_COVER']) <= 35:
            raise ValueError('Scene cloud-cover outside the selection rule')
        # Insufficient-fit scenes are allowed in CSV, but their raster must be empty.
        enough = int(row['tvdi_bins']) >= 6
        if row['tvdi_status'] != ('experimental_fit' if enough else 'insufficient_bins'):
            raise ValueError('Inconsistent TVDI fitting status')
        for key in ('wet_slope', 'wet_intercept', 'dry_slope', 'dry_intercept'):
            if not np.isfinite(float(row[key])):
                raise ValueError('Non-finite TVDI fit coefficient')
        indexes.add(index)
        identities.add(identity)
    return {int(row['scene_index']): row for row in rows}


def validate_candidate(arr, scenes):
    masks = valid(arr)
    if not np.all(masks == masks[0]):
        raise ValueError('All five candidate bands must have identical validity masks')
    usable = masks.all(axis=0)
    for band, lo, hi in ((0, -1, 1), (1, -10, 70), (2, 0, 1)):
        vals = arr[band, usable]
        if np.any((vals < lo) | (vals > hi)):
            raise ValueError('Candidate value outside accepted range')
    ids = arr[3, usable]
    if np.any(ids != np.floor(ids)) or not set(ids.astype(int)) <= set(scenes):
        raise ValueError('Candidate pixels reference unlisted/non-integer scene indexes')
    for index, row in scenes.items():
        selected = usable & (arr[3] == index)
        if selected.any() and row['tvdi_status'] != 'experimental_fit':
            raise ValueError('Valid pixels from an insufficient TVDI fit')
        if np.any(arr[4, selected] != int(row['day_of_year'])):
            raise ValueError('Pixel day-of-year disagrees with its source scene')
    return usable


def validate_diagnostics(rows, baseline_ids, scenes, batch, targets=TARGETS):
    expected_ids = baseline_ids | {r['LANDSAT_PRODUCT_ID'] for r in scenes.values()}
    expected = {(code, identity) for code in targets for identity in expected_ids}
    keys = set()
    for row in rows:
        key = (row['code'], row['LANDSAT_PRODUCT_ID'])
        if key in keys or key not in expected:
            raise ValueError('Duplicate/unexpected diagnostic ward-scene key')
        date = dt.date.fromisoformat(row['acquisition_date'])
        if not (dt.date(2025,1,1) <= date < dt.date(2025,5,1)):
            raise ValueError('Diagnostic date outside Jan–Apr 2025')
        if date.strftime('%Y%m%d') not in row['LANDSAT_PRODUCT_ID']:
            raise ValueError('Diagnostic date does not match product ID')
        if int(row['year']) != 2025 or int(row['resolution_m']) != 120 or int(row['recovery_batch']) != batch:
            raise ValueError('Wrong diagnostic year, grid or batch')
        role = 'baseline' if row['LANDSAT_PRODUCT_ID'] in baseline_ids else 'candidate'
        if row['role'] != role:
            raise ValueError('Wrong diagnostic source role')
        for field in ('footprint','clear_qa','optical_valid','thermal_available','joint_valid'):
            value = float(row[field])
            if not np.isfinite(value) or value < 0 or value != int(value):
                raise ValueError('Diagnostic counts must be finite nonnegative integers')
        keys.add(key)
    if keys != expected:
        raise ValueError('Need diagnostics for every baseline/candidate scene and every target ward')


def review(folder, output, batch=1, targets=None, base_raster=None, base_provenance=None, product_path=None, before_path=None):
    if batch not in (1, 2):
        raise ValueError('Batch must be 1 or 2')
    if batch == 2 and not targets:
        raise ValueError('Batch 2 needs an explicit target list (--targets verification/GEE_2025_batch2_targets.json)')
    targets = set(targets) if targets else TARGETS
    if output.exists():
        raise ValueError('Output folder exists. Use a new folder; do not overwrite a review.')
    prefix = f'MobileGIS_recovery_2025_batch{batch}'
    paths = [folder / (prefix + suffix) for suffix in ('_120m.tif', '_scenes.csv', '_diagnostics.csv')]
    if not all(path.is_file() for path in paths):
        raise ValueError('Need the TIFF, scenes CSV, and diagnostics CSV from the same GEE batch')
    # Batch 1 starts from the original GEE export; batch 2 starts from the published batch-1 recovery.
    baseline_path = Path(base_raster) if base_raster else (ROOT / 'data/gee/rasters/indices_2025_120m.tif' if batch == 1 else BATCH1_DIR / 'indices_2025_recovery_batch1_120m.tif')
    previous_provenance = Path(base_provenance) if base_provenance else BATCH1_DIR / 'provenance_2025_120m.tif'
    product = json.loads(Path(product_path or ROOT / ('public/data/gee/products.json' if batch == 1 else 'public/data/gee_recovery/products.json')).read_text(encoding='utf8'))
    scene_rows = read_csv(paths[1])
    baseline_ids = {row['LANDSAT_PRODUCT_ID'] for row in product['audits']['2025']['scenes']}
    scenes = validate_scenes(scene_rows, baseline_ids, batch)
    diagnostics = read_csv(paths[2])
    validate_diagnostics(diagnostics, baseline_ids, scenes, batch, targets)
    with rasterio.open(baseline_path) as base, rasterio.open(paths[0]) as candidate:
        if candidate.descriptions != DESCRIPTIONS or candidate.crs != base.crs or candidate.transform != base.transform:
            raise ValueError('Candidate must have the exact baseline CRS, transform and band names')
        if candidate.shape != base.shape or candidate.res != (120., 120.):
            raise ValueError('Candidate shape/resolution does not match baseline')
        if candidate.nodata != NODATA:
            raise ValueError('Expected candidate NoData -9999')
        arr = candidate.read().astype('float32')
        validate_candidate(arr, scenes)
        baseline = base.read()
        target_geometries = [transform_geom('EPSG:4326', base.crs, g)
                             for code, _, g in features() if code in targets]
        target_mask = geometry_mask(target_geometries, out_shape=base.shape, transform=base.transform, invert=True)
        # GEE clip/native-grid sampling can leave a few edge pixels outside the
        # exact exported-grid centre mask. Discard them, never change neighbours.
        outside_pixels = int((valid(arr).all(axis=0) & ~target_mask).sum())
        merged, filled = merge_gaps(baseline, arr, target_mask)
        if not filled.any():
            raise ValueError('No new valid pixel triplets. Active source remains unchanged; try another batch.')
        profile = base.profile.copy()
    output.mkdir(parents=True)
    for path in paths:
        preserve(path, output / 'originals' / path.name)
    merged_path = output / f'indices_2025_recovery_batch{batch}_120m.tif'
    with rasterio.open(merged_path, 'w', **profile) as dst:
        dst.write(merged)
        for i, key in enumerate(DESCRIPTIONS[:3], 1): dst.set_band_description(i, key)
    # Provenance: 0 = baseline retained, 1..4 = batch-1 scene, 11..14 = batch-2 scene, -9999 = missing.
    if batch == 1:
        provenance = np.full((2, *filled.shape), NODATA, dtype='float32')
        provenance[:, valid(baseline).any(axis=0)] = 0
    else:
        with rasterio.open(previous_provenance) as prev:
            if prev.shape != filled.shape:
                raise ValueError('Previous provenance grid does not match the baseline')
            provenance = prev.read().astype('float32')
    provenance[:, filled] = arr[3:, filled]
    provenance[0, filled] += SCENE_OFFSET[batch]
    profile.update(count=2, dtype='float32', nodata=NODATA)
    with rasterio.open(output / 'provenance_2025_120m.tif', 'w', **profile) as dst:
        dst.write(provenance)
        dst.set_band_description(1, 'scene_index')
        dst.set_band_description(2, 'day_of_year')
    with rasterio.open(merged_path) as ds: after = zonal(ds, features())
    before = {row['code']: row for row in json.loads(Path(before_path or ROOT / ('public/data/gee/observations.json' if batch == 1 else 'public/data/gee_recovery/observations.json')).read_text(encoding='utf8')) if row['year'] == 2025}
    report = {'status':'review_only_not_published', 'year':2025, 'batch':batch,
        'method':('Preserve every finite baseline value; fill only entirely missing triplets in five target wards with same-scene Jan–Apr 2025 pixels.' if batch == 1
                  else f'Batch 2: preserve every finite value of the published batch-1 recovery; fill only entirely missing triplets in {len(targets)} target wards with same-scene Jan–Apr 2025 pixels from scenes not used before.'),
        'scene_index_offset':SCENE_OFFSET[batch], 'target_codes':sorted(targets),
        'filled_pixels':int(filled.sum()), 'discarded_outside_target_pixels':outside_pixels,
        'baseline_sha256':sha(baseline_path),
        'input_files':[{'file':p.name,'sha256':sha(p)} for p in paths],
        'scenes':scene_rows, 'per_scene_filled_pixels':{str(i):int((filled & (arr[3] == i)).sum()) for i in scenes},
        'wards':[{ 'code':r['code'], 'name':r['name'],
          'before':{k:before[r['code']][k] for key in KEYS for k in (key,key+'_pixels',key+'_coverage')},
          'after':{k:r[k] for key in KEYS for k in (key,key+'_pixels',key+'_coverage')},
          'enough_at_10_percent':all(r[k] is not None for k in KEYS),
          'enough_at_50_percent':all(r[k+'_coverage'] >= .5 and r[k+'_pixels'] >= 5 for k in KEYS)
        } for r in after if r['code'] in targets],
        'limitations':'Different dates and per-scene TVDI fits. Review coverage and scientific comparability before adoption. Do not replace active GEE files with this candidate directly.'}
    (output / 'review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf8')
    (output / 'observations_2025_review.json').write_text(json.dumps(after, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--batch', type=int, default=1)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--targets', type=Path, help='JSON with target_codes (required for --batch 2)')
    args = parser.parse_args()
    codes = json.loads(args.targets.read_text(encoding='utf8'))['target_codes'] if args.targets else None
    result = review(args.input, args.output, args.batch, targets=codes)
    print(json.dumps({'status':result['status'],'filled_pixels':result['filled_pixels'],
                      'wards':result['wards']}, ensure_ascii=False, indent=2))
