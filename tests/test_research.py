"""Integrity and independent raster/table checks; no writes to the user's database."""
import csv
import importlib.util
import json
import math
from pathlib import Path
import random
import sys
import threading
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.warp import transform_geom
from shapely.geometry import shape
from build_landsat import indices, fit_tvdi

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

class ResearchDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geo=read_json(ROOT/'public/data/hcm_167.geojson')
        cls.rows=read_json(ROOT/'public/data/observations_real.json')
        cls.manifest=read_json(ROOT/'public/data/landsat_manifest.json')

    def test_boundaries_and_2025_codes(self):
        features=self.geo['features']
        self.assertEqual(len(features),167)
        codes={f['id'] for f in features}
        self.assertEqual(len(codes),167)
        self.assertNotIn('26732',codes)
        self.assertIn('27676',codes)
        for f in features:
            self.assertTrue(shape(f['geometry']).is_valid)
        audit=read_json(ROOT/'public/data/boundary_source.json')
        self.assertEqual(audit['list_verification']['status'],'matched')

    def test_six_years_of_observed_data(self):
        self.assertEqual([d['year'] for d in self.manifest['years']],list(range(2020,2026)))
        self.assertEqual(len(self.rows),1002)
        self.assertEqual(len({(r['code'],r['year']) for r in self.rows}),1002)
        for year in self.manifest['years']:
            self.assertGreater(len(year['scenes']),0)
            self.assertGreater(sum(s['pixels_used'] for s in year['scenes']),10000)
            for scene in year['scenes']:
                self.assertTrue(scene['id'].startswith(('LC08_L2SP','LC09_L2SP')))
                self.assertEqual(int(scene['datetime'][:4]),year['year'])
                self.assertIn(int(scene['datetime'][5:7]),(1,2,3,4))
            for layer in year['layers'].values():
                self.assertTrue((ROOT/'public'/layer['image'].lstrip('/')).is_file())
                self.assertGreater(layer['valid_pixels'],100)

    def test_ranges_coverage_and_missing_values(self):
        for r in self.rows:
            for k,lo,hi in [('lst',-10,70),('ndvi',-1,1),('tvdi',0,1)]:
                v=r[k]
                if v is not None:
                    self.assertTrue(math.isfinite(v) and lo<=v<=hi)
                    self.assertGreaterEqual(r[k+'_pixels'],5)
                    self.assertGreaterEqual(r[k+'_coverage'],.1)
                self.assertGreaterEqual(r[k+'_coverage'],0)
                self.assertLessEqual(r[k+'_coverage'],1)
                self.assertLessEqual(r[k+'_pixels'],r['sampled_pixels'])

    def test_independent_zonal_means_for_ten_units_all_years(self):
        codes=random.Random(2025).sample(sorted(f['id'] for f in self.geo['features']),10)
        original={}
        for path in (ROOT/'data/sources/boundaries').glob('*.geojson'):
            f=read_json(path)['features'][0]
            if f['properties']['code'] in codes:
                original[f['properties']['code']]=f['geometry']
        checked=[]
        for year in range(2020,2026):
            for k in ('lst','ndvi','tvdi'):
                with rasterio.open(ROOT/f'data/rasters/{k}_{year}_120m.tif') as src:
                    array=src.read(1,masked=True)
                    for code in codes:
                        geometry=transform_geom('EPSG:4326',src.crs,original[code])
                        inside=geometry_mask([geometry],out_shape=src.shape,transform=src.transform,invert=True)
                        values=array[inside].compressed()
                        coverage=round(len(values)/int(inside.sum()),4)
                        expected=round(float(values.mean()),4) if len(values)>=5 and coverage>=.1 else None
                        r=next(r for r in self.rows if r['code']==code and r['year']==year)
                        if expected is None:self.assertIsNone(r[k])
                        else:self.assertAlmostEqual(expected,r[k],places=4,msg=f'{code}/{year}/{k}')
                        self.assertEqual(len(values),r[k+'_pixels'])
                        checked.append({'code':code,'year':year,'index':k,'geotiff_mean':expected,'table_mean':r[k], 'pixels':len(values),'pass':True})
        dest=ROOT/'verification'
        dest.mkdir(exist_ok=True)
        with (dest/'zonal_crosscheck.csv').open('w',encoding='utf-8-sig',newline='') as fh:
            w=csv.DictWriter(fh,fieldnames=list(checked[0]));w.writeheader();w.writerows(checked)

    def test_csv_matches_json(self):
        with (ROOT/'public/data/observations_real.csv').open(encoding='utf-8-sig',newline='') as fh:
            csv_rows=list(csv.DictReader(fh))
        self.assertEqual(len(csv_rows),len(self.rows))
        for r,j in zip(csv_rows,self.rows):
            self.assertEqual((r['code'],int(r['year'])),(j['code'],j['year']))
            for k in ('lst','ndvi','tvdi'):
                self.assertEqual(float(r[k]) if r[k] else None,j[k])

    def test_user_csv_preserves_all_values_and_stays_separate(self):
        with (ROOT/'public/data/user_supplied_original.csv').open(encoding='utf-8-sig',newline='') as fh:
            originals=list(csv.DictReader(fh))
        imported=read_json(ROOT/'public/data/observations_user.json')
        self.assertEqual(len(originals),24)
        self.assertEqual(len(imported),24)
        self.assertEqual(len({(r['name'],r['year']) for r in imported}),24)
        for old in originals:
            row=next(r for r in imported if r['original_name']==old['name'] and r['year']==int(float(old['year'])))
            for k in ('lat','lon','lst','ndvi','tvdi'):
                self.assertEqual(float(old[k]),row[k])
            self.assertEqual(row['source'],old['source'])
            self.assertEqual(len(row['containing_units']),1)
            self.assertEqual(row['dataset'],'user_csv')
        self.assertEqual(sum(r['tvdi']==1 for r in imported),3)
        self.assertEqual(len(self.rows),1002)

    def test_calibration_and_quality_flags(self):
        red=np.full((1,9),10000,dtype='uint16')
        nir=np.full((1,9),20000,dtype='uint16')
        temp=np.full((1,9),45000,dtype='uint16')
        qa=np.array([[0,1,2,4,8,16,32,128,0]],dtype='uint16')
        rad=np.array([[0,0,0,0,0,0,0,0,16]],dtype='uint16')
        ndvi,lst,water=indices(red,nir,temp,qa,rad)
        self.assertAlmostEqual(float(ndvi[0,0]),(.35-.075)/(.35+.075),places=5)
        self.assertAlmostEqual(float(lst[0,0]),45000*.00341802+149-273.15,places=4)
        self.assertTrue(np.isnan(ndvi[0,1:7]).all())
        self.assertTrue(np.isnan(ndvi[0,8]))
        self.assertTrue(water[0,7])
        tvdi,fit=fit_tvdi(ndvi,lst,~water)
        self.assertTrue(np.isnan(tvdi).all())
        self.assertEqual(fit['status'],'insufficient_bins')

class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location('mobile_server',ROOT/'server.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        from http_support import HTTPTestServer
        cls.server=HTTPTestServer(module.app)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_static_research_and_original_demo_remain_separate(self):
        def get(path):
            with urllib.request.urlopen(self.base+path) as r:return json.load(r)
        self.assertEqual(len(get('/data/observations_real.json')),1002)
        self.assertEqual(len(get('/api/observations')),36)
        self.assertEqual(len(get('/data/hcm_167.geojson')['features']),167)
    def test_raster_download_and_whitelist(self):
        with urllib.request.urlopen(self.base+'/api/rasters/lst_2025_120m.tif') as r:
            self.assertEqual(r.status,200);self.assertTrue(r.read().startswith(b'II'))
        with self.assertRaises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(self.base+'/api/rasters/server.py')
        self.assertEqual(err.exception.code,404)

if __name__=='__main__':
    unittest.main(verbosity=2)
