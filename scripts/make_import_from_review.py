"""Turn a reviewed GEE recovery batch into a CSV for the admin tab "Nhập số liệu" (read-only on all published data).

    python scripts/make_import_from_review.py data/gee_recovery/batch2_20261101_review [--out file.csv]

Only communes whose numbers actually change are written. Dates are the acquisition dates of the scenes that really supplied
pixels to that commune (from the provenance raster). Pixel layers/tiles are NOT changed by this route.
"""
import argparse, csv, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import features
from review_gee_recovery import SCENE_OFFSET
import observation_imports as oi


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    folder = args.folder if args.folder.is_absolute() else ROOT / args.folder
    report = json.loads((folder / 'review.json').read_text(encoding='utf8'))
    batch = report['batch']
    offset = SCENE_OFFSET[batch]
    scenes = {int(s['scene_index']) + offset: s for s in report['scenes']}
    published = {(r['code'], r['year']): r for r in json.loads((ROOT / 'public/data/gee_recovery/observations.json').read_text(encoding='utf8'))}
    geoms = {code: g for code, _, g in features()}
    rows = []
    with rasterio.open(folder / 'provenance_2025_120m.tif') as prov:
        scene_band = prov.read(1)
        for ward in report['wards']:
            code, before, after = ward['code'], ward['before'], ward['after']
            if all(before[k] == after[k] for k in before):
                continue
            base = published[(code, 2025)]
            mask = geometry_mask([transform_geom(4326, prov.crs, geoms[code])], out_shape=prov.shape, transform=prov.transform, invert=True)
            used = sorted({int(i) for i in np.unique(scene_band[mask]) if i > offset and int(i) in scenes})
            row = {'code': code, 'year': 2025, 'sampled_pixels': base['sampled_pixels'], 'dates': ';'.join(sorted({scenes[i]['acquisition_date'] for i in used}))}
            for k in oi.INDICES:
                row[k], row[k + '_pixels'] = (round(after[k], 6) if after[k] is not None else ''), after[k + '_pixels']
            rows.append(row)
    out = args.out or folder / f'nhap_so_lieu_dot{batch}.csv'
    out.write_text(oi.template_csv(rows), encoding='utf-8')
    print(json.dumps({'file': str(out), 'rows': len(rows), 'batch': batch}, ensure_ascii=False))


if __name__ == '__main__':
    main()
