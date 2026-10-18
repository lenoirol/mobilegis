"""Independent validation of the real recovery export and published source."""
import json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from import_gee import features, zonal, sha, NODATA

def read(path):return json.loads((ROOT/path).read_text(encoding='utf8'))

class PublishedRecovery(unittest.TestCase):
    def test_independent_zonal_and_preservation(self):
        before=read('public/data/gee/observations.json');after=read('public/data/gee_recovery/observations.json')
        report=read('data/gee_recovery/batch1_20261004/review.json')
        targets={r['code'] for r in report['wards']}
        self.assertEqual(len(after),1002)
        for a,b in zip(before,after):
            if a['year']!=2025 or a['code'] not in targets:self.assertEqual(a,b)
        base=ROOT/'data/gee/rasters/indices_2025_120m.tif'
        self.assertEqual(sha(base),report['baseline_sha256'])
        with rasterio.open(base) as original,rasterio.open(ROOT/'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif') as recovered:
            a=original.read();b=recovered.read();computed=zonal(recovered,features())
            self.assertTrue(np.array_equal(a[a!=NODATA],b[a!=NODATA]))
            mask=geometry_mask([transform_geom(4326,recovered.crs,g) for c,_,g in features() if c in targets],out_shape=recovered.shape,transform=recovered.transform,invert=True)
            self.assertTrue(np.array_equal(a[:,~mask],b[:,~mask]))
            filled=(a==NODATA).all(axis=0)&(b!=NODATA).all(axis=0)
            self.assertEqual(int(filled.sum()),6325)
        stored={r['code']:r for r in after if r['year']==2025}
        for r in computed:
            for k in ('ndvi','lst','tvdi'):
                self.assertEqual(r[k],stored[r['code']][k]);self.assertEqual(r[k+'_pixels'],stored[r['code']][k+'_pixels'])
                self.assertIsNotNone(r[k])
        for code in targets:
            self.assertGreater(min(stored[code][k+'_coverage'] for k in ('ndvi','lst','tvdi')),.96)
            self.assertTrue(stored[code]['recovery_dates'])

    def test_provenance_and_input_hashes(self):
        report=read('data/gee_recovery/batch1_20261004/review.json')
        folder=ROOT/'data/gee_recovery/batch1_20261004'
        for f in report['input_files']:self.assertEqual(sha(folder/'originals'/f['file']),f['sha256'])
        with rasterio.open(folder/'originals/MobileGIS_recovery_2025_batch1_120m.tif') as raw,rasterio.open(folder/'provenance_2025_120m.tif') as provenance,rasterio.open(folder/'indices_2025_recovery_batch1_120m.tif') as merged:
            p=provenance.read();r=raw.read();b=merged.read();filled=p[0]>0
            self.assertEqual(int(filled.sum()),6325)
            self.assertTrue(np.array_equal(b[:,filled],r[:3,filled]))
            self.assertTrue(np.array_equal(p[:,filled],r[3:,filled]))
            scenes={int(s['scene_index']):s for s in report['scenes']}
            for i in np.unique(p[0,filled]):
                self.assertTrue(np.all(p[1,p[0]==i]==int(scenes[int(i)]['day_of_year'])))
                self.assertTrue(scenes[int(i)]['acquisition_date'].startswith('2025-'))

    def test_changes_use_only_common_valid_pixels(self):
        product=read('public/data/gee_recovery/products.json')
        self.assertEqual(product['source_id'],'gee_recovery')
        with rasterio.open(ROOT/'data/gee/rasters/indices_2020_120m.tif') as first,rasterio.open(ROOT/'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif') as last:
            a=first.read();b=last.read()
            for i,k in enumerate(('ndvi','lst','tvdi')):
                valid=(a[i]!=NODATA)&(b[i]!=NODATA)
                with rasterio.open(ROOT/f'data/gee_recovery/batch1_20261004/change_{k}_2020_2025_120m.tif') as ds:d=ds.read(1)
                self.assertTrue(np.array_equal(d[valid],b[i,valid]-a[i,valid]))
                self.assertTrue(np.all(d[~valid]==NODATA))
                self.assertEqual(product['change'][k]['valid_pairs'],int(valid.sum()))

if __name__=='__main__':unittest.main()
