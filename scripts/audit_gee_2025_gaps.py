"""Audit five missing wards; cached USGS QA is supporting, not exact GEE QA."""
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
from import_gee import features, read_csv, sha
from review_gee_recovery import TARGETS


def main():
    observations = json.loads((ROOT/'public/data/gee/observations.json').read_text(encoding='utf8'))
    scenes = read_csv(ROOT/'data/gee/originals/MobileGIS_scenes_2025.csv')
    with rasterio.open(ROOT/'data/rasters/lst_2025_120m.tif') as ds:
        masks = {code:geometry_mask([transform_geom(4326,ds.crs,g)],
                 out_shape=ds.shape,transform=ds.transform,invert=True)
                 for code, _, g in features() if code in TARGETS}
        grid = {'crs':str(ds.crs),'shape':list(ds.shape),'transform':list(ds.transform)}
    cached = []
    for row in scenes:
        # PC uses product IDs without the processing-date component.
        parts = row['LANDSAT_PRODUCT_ID'].split('_')
        identifier = '_'.join(parts[:4] + parts[5:])
        folder = ROOT/'data/sampled_inputs'/identifier
        keys = ('red','nir08','lwir11','qa_pixel','qa_radsat')
        paths = [folder/(k+'.npy') for k in keys]
        if not all(p.is_file() for p in paths):
            cached.append({'scene':identifier,'status':'cached_inputs_unavailable'})
            continue
        red, nir, temp, qa, sat = [np.load(p) for p in paths]
        if any(a.shape != tuple(grid['shape']) for a in (red,nir,temp,qa,sat)):
            raise ValueError('Cached QA shape does not match its local grid')
        reflectance_red = red.astype('float64') * .0000275 - .2
        reflectance_nir = nir.astype('float64') * .0000275 - .2
        lst = temp.astype('float64') * .00341802 + 149 - 273.15
        footprint = (red > 0) & (nir > 0) & ((qa & 1) == 0)
        qa_clear = footprint & ((qa & 63) == 0) & (sat == 0)
        optical = qa_clear & (reflectance_red >= 0) & (reflectance_red <= 1)
        optical &= (reflectance_nir >= 0) & (reflectance_nir <= 1) & ((reflectance_red+reflectance_nir) > 0)
        thermal = (temp > 0) & (lst >= -10) & (lst <= 70)
        flags = {'footprint':footprint,'qa_clear':qa_clear,'optical_valid':optical,
                 'joint_valid':optical & thermal,'qa_rejected':footprint & ((qa & 62) != 0),
                 'cloud_or_shadow':footprint & ((qa & 30) != 0),
                 'optical_clear_but_thermal_missing':optical & ~thermal}
        cached.append({'scene':identifier,'date':row['acquisition_date'],
                       'wards':{code:{k:int((flag & mask).sum()) for k,flag in flags.items()} for code,mask in masks.items()}})
    report = {'year':2025,'status':'diagnosed_locally_recovery_exports_pending',
        'baseline_files':[{'file':p.name,'sha256':sha(p)} for p in
          [ROOT/'data/gee/originals'/f'MobileGIS_{kind}_2025{suffix}'
            for kind,suffix in [('indices','_120m.tif'),('units','_120m.csv'),('scenes','.csv')]]],
        'threshold':{'min_pixels':5,'min_coverage':.1,'recommended_review_coverage':.5},
        'wards':[{k:r[k] for k in ('code','name','sampled_pixels','lst_pixels','ndvi_pixels','tvdi_pixels',
                                  'lst_coverage','ndvi_coverage','tvdi_coverage')}
                 for r in observations if r['year']==2025 and r['code'] in TARGETS],
        'cached_qa_grid':grid,'cached_scene_diagnostics':cached,
        'caveat':'Cached USGS inputs are nearest-neighbour samples on a different local grid. These counts support a hypothesis, not exact attribution of GEE export masks. Run the provided GEE diagnostics to confirm.',
        'report_scope':{'file':'C:/Users/phuhuy/Downloads/mục 8 linh mục 9 phương.docx',
                        'sections':['4.2','5.2','6.3','7.1','8.1'],'years':[2020,2025],
                        'year_2026_required':False}}
    output = ROOT/'verification/GEE_2025_gap_diagnosis.json'
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__ == '__main__':main()
