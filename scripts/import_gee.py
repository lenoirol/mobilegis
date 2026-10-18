"""Validate GEE exports, preserve originals and publish a separate research source.

Statistics use pixel CENTRES on each exported grid, independently per polygon.
Never clamp incorrect coverage or combine this source with legacy PC results.
Requires processing dependencies, not needed by the running demo.
"""
import argparse, csv, hashlib, json, shutil, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask, geometry_window
from rasterio.windows import Window
from rasterio.warp import transform_geom
from rasterio.enums import Resampling
import shapefile
from build_visual_products import tiles, query_grid, CLASSES, write_json

DATA = ROOT / 'data/gee'
PUBLIC = ROOT / 'public/data/gee'
NODATA = -9999

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f: return list(csv.DictReader(f))

def features():
    reader = shapefile.Reader(str(ROOT / 'data/gee_boundary/hcm167_GEE.zip'), encoding='utf-8')
    return [(str(r.record['code']).zfill(5), r.record['fullname'], r.shape.__geo_interface__)
            for r in reader.iterShapeRecords()]

def preserve(path, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and sha(destination) != sha(path):
        raise ValueError(f'Original already exists with a different hash: {destination}. Use a new source version.')
    if not destination.exists(): shutil.copy2(path, destination)

def zonal(ds, units, categorical=False):
    """Use each original uploaded polygon and EXACT TIFF grid/centre rule."""
    rows = []
    for code, name, geometry in units:
        geom = transform_geom('EPSG:4326', ds.crs, geometry)
        win = geometry_window(ds, [geom]).intersection(Window(0, 0, ds.width, ds.height))
        arr = ds.read(window=win)
        inside = geometry_mask([geom], out_shape=arr.shape[1:],
                               transform=ds.window_transform(win), invert=True)
        total = int(inside.sum())
        row = {'code': code, 'name': name, 'sampled_pixels': total}
        if categorical:
            vals = arr[0][inside]
            vals = vals[np.isin(vals, [c[0] for c in CLASSES])]
            row.update(valid_pixels=int(vals.size), coverage=float(vals.size / total) if total else 0,
                       classes=[{'code': c, 'name': n, 'color': color,
                                 'pixels': int((vals == c).sum()),
                                 'percent': float((vals == c).sum() / vals.size * 100) if vals.size else 0}
                                for c, n, color in CLASSES])
        else:
            for i, key in enumerate(('ndvi', 'lst', 'tvdi')):
                a = arr[i][inside]
                a = a[np.isfinite(a) & (a != NODATA)]
                count = int(a.size)
                coverage = count / total if total else 0
                row[key + '_pixels'] = count
                row[key + '_coverage'] = coverage
                row[key] = float(a.astype('float64').mean()) if count >= 5 and coverage >= .1 else None
        rows.append(row)
    return rows

def import_year(folder, year, units):
    paths = {k: folder / name for k, name in {
        'indices': f'MobileGIS_indices_{year}_120m.tif',
        'units': f'MobileGIS_units_{year}_120m.csv',
        'scenes': f'MobileGIS_scenes_{year}.csv'}.items()}
    if not all(p.is_file() for p in paths.values()): raise ValueError(f'Year {year}: need all three TIFF/CSV exports')
    originals = []
    for path in paths.values():
        dest = DATA / 'originals' / path.name
        preserve(path, dest)
        originals.append({'file': path.name, 'sha256': sha(path), 'bytes': path.stat().st_size,
                          'download': '/api/gee/originals/' + path.name})
    original_rows = read_csv(paths['units'])
    codes = {c for c, _, _ in units}
    if len(original_rows) != 167 or {r['code'] for r in original_rows} != codes:
        raise ValueError('CSV unit codes do not match the 167 uploaded polygons')
    scenes = read_csv(paths['scenes'])
    if len(scenes) != 4 or any(int(s['year']) != year for s in scenes): raise ValueError('Expected four scenes for the requested year')
    if any(not s['acquisition_date'].startswith(str(year)) for s in scenes): raise ValueError('Scene dates do not match year')
    out = DATA / 'rasters' / f'indices_{year}_120m.tif'
    out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(paths['indices']) as src:
        if src.count != 3 or src.descriptions != ('NDVI', 'LST', 'TVDI') or src.crs.to_epsg() != 32648 or src.res != (120., 120.):
            raise ValueError('Expected NDVI/LST/TVDI, EPSG:32648, 120 m')
        profile = src.profile.copy()
        profile.update(driver='GTiff', nodata=NODATA, compress='deflate')
        with rasterio.open(out, 'w', **profile) as dst:
            for _, win in src.block_windows(1):
                arr = src.read(window=win)
                arr[~np.isfinite(arr)] = NODATA
                dst.write(arr, window=win)
            for i, desc in enumerate(src.descriptions, 1): dst.set_band_description(i, desc)
    with rasterio.open(out) as ds:
        rows = zonal(ds, units)
        arrays = ds.read().astype('float32')
        arrays[arrays == NODATA] = np.nan
        affine = ds.transform
        absolute = {}; queries = {}
        for i, key in enumerate(('ndvi', 'lst', 'tvdi')):
            from build_landsat import PALETTES
            lo, hi, colors = PALETTES[key]
            absolute[key] = tiles(arrays[i], affine, ds.crs, f'gee_{key}_{year}', lo=lo, hi=hi, colors=colors)
            queries[f'{key}_{year}'] = query_grid(arrays[i], affine, f'gee_{key}_{year}')
    ids = [s['LANDSAT_PRODUCT_ID'] for s in scenes]
    dates = sorted({s['acquisition_date'] for s in scenes})
    for r in rows:
        r.update(year=year, dates=dates, scene_ids=ids, source='Google Earth Engine · Landsat C2 L2',
                 resolution_m=120, method='exported_grid_pixel_centres_unweighted', tvdi_status='experimental')
    original_map = {r['code']: r for r in original_rows}
    audit = {'year': year, 'original_files': originals, 'units': 167,
             'method': 'Recomputed directly from exported TIFF using original uploaded polygons; unweighted pixel centres, float64 means. Original GEE weighted means may differ.',
             'original_bad_coverage': {}, 'valid_means': {}, 'missing_units': {}, 'finite_pixels': {},
             'mean_differences': {}, 'raster': '/api/gee/rasters/' + out.name, 'scenes': scenes}
    for i, key in enumerate(('ndvi', 'lst', 'tvdi')):
        upper = key.upper()
        audit['original_bad_coverage'][key] = sum(float(r[upper + '_coverage'] or 0) > 1 for r in original_rows)
        audit['valid_means'][key] = sum(r[key] is not None for r in rows)
        audit['missing_units'][key] = [r['name'] for r in rows if r[key] is None]
        audit['finite_pixels'][key] = int(np.isfinite(arrays[i]).sum())
        diffs = [abs(r[key] - float(original_map[r['code']][upper + '_mean'])) for r in rows
                 if r[key] is not None and original_map[r['code']][upper + '_mean']]
        audit['mean_differences'][key] = {'max_absolute': max(diffs) if diffs else None,
                                         'median_absolute': float(np.median(diffs)) if diffs else None}
        assert all(0 <= r[key + '_coverage'] <= 1 and r[key + '_pixels'] <= r['sampled_pixels'] for r in rows)
    return rows, absolute, queries, audit

def import_cover(path, units):
    dest = DATA / 'originals' / path.name
    preserve(path, dest)
    out = DATA / 'rasters/worldcover_2021_10m.tif'
    out.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path) as src:
        if src.count != 1 or src.crs.to_epsg() != 32648 or src.res != (10., 10.): raise ValueError('Expected WorldCover EPSG:32648, 10 m')
        profile = src.profile.copy(); profile.update(driver='GTiff', nodata=0, compress='deflate')
        with rasterio.open(out, 'w', **profile) as dst:
            for _, win in src.block_windows(1): dst.write(src.read(window=win), window=win)
            dst.set_band_description(1, 'Map')
    with rasterio.open(out) as ds:
        stats = zonal(ds, units, categorical=True)
        h, w = (ds.height + 2) // 3, (ds.width + 2) // 3
        sample = ds.read(1, out_shape=(h, w), resampling=Resampling.nearest)
        affine = ds.transform * rasterio.Affine.scale(ds.width / w, ds.height / h)
    meta = {**tiles(sample, affine, 32648, 'gee_worldcover_2021', style='classes'),
            'year': 2021, 'source_resolution_m': 10, 'sample_resolution_m': 30,
            'stats_resolution_m': 10, 'source': 'ESA WorldCover v200 exported through Google Earth Engine',
            'gee_asset': 'ESA/WorldCover/v200', 'license': 'CC BY 4.0',
            'classes': [{'code': c, 'name': n, 'color': color} for c, n, color in CLASSES],
            'download': '/api/gee/rasters/worldcover_2021_10m.tif', 'sha256_original': sha(path)}
    write_json(PUBLIC / 'landcover_stats.json', stats)
    return meta

def paired_changes(product):
    """Enable comparisons only when both GEE years actually exist on one grid."""
    if not all(str(y) in product['absolute'] for y in (2020, 2025)): return
    with rasterio.open(DATA/'rasters/indices_2020_120m.tif') as first, rasterio.open(DATA/'rasters/indices_2025_120m.tif') as last:
        if first.crs!=last.crs or first.transform!=last.transform or first.shape!=last.shape:
            raise ValueError('GEE 2020/2025 grids differ: need explicit aligned comparison before enabling change maps')
        a=first.read().astype('float32');b=last.read().astype('float32')
        a[a==NODATA]=np.nan;b[b==NODATA]=np.nan
        profile=last.profile.copy();profile.update(count=1)
        for i,key in enumerate(('ndvi','lst','tvdi')):
            delta=b[i]-a[i]
            limit={'lst':10,'ndvi':.3,'tvdi':.4}[key]
            out=DATA/'rasters'/f'change_{key}_2020_2025_120m.tif'
            with rasterio.open(out,'w',**profile) as dst:
                dst.write(np.where(np.isfinite(delta),delta,NODATA).astype('float32'),1)
                dst.set_band_description(1,'delta_'+key)
            product['change'][key]={**tiles(delta,last.transform,last.crs,f'gee_change_{key}_2020_2025',lo=-limit,hi=limit,colors=['#2171b5','#f7f7f7','#c53a32']),
                'from':2020,'to':2025,'min':-limit,'max':limit,'valid_pairs':int(np.isfinite(delta).sum()),
                'note':'Only same-source GEE valid pixel pairs; scene dates differ, not a causal trend estimate.'}
            product['query']['change_'+key]=query_grid(delta,last.transform,'gee_change_'+key)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    units = features()
    product_path = PUBLIC / 'products.json'
    product = json.loads(product_path.read_text(encoding='utf-8')) if product_path.exists() else {
        'source_id': 'gee', 'version': '2026.10.GEE', 'absolute': {}, 'query': {}, 'context': {}, 'change': {}, 'audits': {}}
    all_rows = json.loads((PUBLIC / 'observations.json').read_text(encoding='utf-8')) if (PUBLIC / 'observations.json').exists() else []
    imported = []
    for path in sorted(args.input.glob('MobileGIS_indices_*_120m.tif')):
        year = int(path.stem.split('_')[2])
        if year not in range(2020, 2026): raise ValueError('Only 2020–2025 supported')
        rows, absolute, queries, audit = import_year(args.input, year, units)
        all_rows = [r for r in all_rows if r['year'] != year] + rows
        product['absolute'][str(year)] = absolute
        product['query'].update(queries)
        product['audits'][str(year)] = audit
        imported.append(year)
    cover = args.input / 'MobileGIS_WorldCover_2021_10m.tif'
    if cover.exists():
        previous=product['context'].get('worldcover',{})
        if previous.get('sha256_original')!=sha(cover) or not (DATA/'rasters/worldcover_2021_10m.tif').exists():
            product['context']['worldcover'] = import_cover(cover, units)
    product['available_years'] = sorted(int(y) for y in product['absolute'])
    if not all_rows: raise ValueError('No complete index year found')
    paired_changes(product)
    product['pending_years'] = [y for y in range(2020, 2026) if y not in product['available_years']]
    product['generated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    product['method'] = 'Independent GEE source. Grid centres; do not mix with legacy PC seasonal results.'
    write_json(PUBLIC / 'observations.json', sorted(all_rows, key=lambda r: (r['code'], r['year'])))
    write_json(product_path, product)
    with (PUBLIC / 'observations.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(all_rows[0]))
        writer.writeheader()
        writer.writerows({k: json.dumps(v, ensure_ascii=False) if isinstance(v, list) else v for k, v in r.items()} for r in all_rows)
    print(json.dumps({'imported': imported, 'available': product['available_years'],
                      'pending': product['pending_years'], 'audit_2025': product['audits'].get('2025')}, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
