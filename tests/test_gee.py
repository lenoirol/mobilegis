"""GEE originals, exported-grid statistics and source isolation regression checks."""
import csv, hashlib, importlib.util, json, math, sys, threading, unittest, urllib.request, urllib.error, tempfile
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
import rasterio
from import_gee import features, zonal

def read(path): return json.loads(path.read_text(encoding='utf-8'))

class GEEIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.product=read(ROOT/'public/data/gee/products.json')
        cls.rows=read(ROOT/'public/data/gee/observations.json')
        spec=importlib.util.spec_from_file_location('gee_server',ROOT/'server.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);cls.module=module
        from http_support import HTTPTestServer
        cls.server=HTTPTestServer(module.app)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def get(self,path):
        with urllib.request.urlopen(self.base+path) as r:return json.load(r)
    def test_originals_are_unchanged(self):
        for audit in self.product['audits'].values():
            for source in audit['original_files']:
                file=ROOT/'data/gee/originals'/source['file']
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),source['sha256'])
        wc=ROOT/'data/gee/originals/MobileGIS_WorldCover_2021_10m.tif'
        self.assertEqual(hashlib.sha256(wc.read_bytes()).hexdigest(),self.product['context']['worldcover']['sha256_original'])
    def test_coverage_and_year_completeness(self):
        self.assertEqual(self.product['available_years'],list(range(2020,2026)))
        self.assertEqual(self.product['pending_years'],[])
        self.assertEqual(len(self.rows),1002)
        self.assertEqual(len({r['code'] for r in self.rows}),167)
        self.assertEqual(len({(r['code'],r['year']) for r in self.rows}),1002)
        for year in range(2020,2026):
            year_rows=[r for r in self.rows if r['year']==year]
            self.assertEqual(len(year_rows),167)
            for k in ('lst','ndvi','tvdi'):
                self.assertEqual(sum(r[k] is not None for r in year_rows),162 if year==2025 else 167)
        for k in ('lst','ndvi','tvdi'):
            for r in self.rows:
                self.assertLessEqual(r[k+'_pixels'],r['sampled_pixels'])
                self.assertAlmostEqual(r[k+'_coverage'],r[k+'_pixels']/r['sampled_pixels'])
                self.assertTrue(0<=r[k+'_coverage']<=1)
                if r[k+'_coverage']<.1:self.assertIsNone(r[k])
    def test_normalized_pixels_exactly_preserved(self):
        for year in range(2020,2026):
            with self.subTest(year=year), rasterio.open(ROOT/f'data/gee/originals/MobileGIS_indices_{year}_120m.tif') as raw, rasterio.open(ROOT/f'data/gee/rasters/indices_{year}_120m.tif') as normalized:
                a=raw.read();b=normalized.read()
                self.assertEqual(normalized.nodata,-9999)
                self.assertTrue(np.isfinite(b).all())
                self.assertTrue(np.array_equal(a[np.isfinite(a)],b[np.isfinite(a)]))
                self.assertTrue(np.all(b[~np.isfinite(a)]==-9999))
                self.assertEqual(normalized.descriptions,('NDVI','LST','TVDI'))
                self.assertEqual(raw.transform,normalized.transform)
                self.assertEqual(raw.res,(120.,120.));self.assertEqual(raw.crs.to_epsg(),32648)
    def test_all_unit_means_recomputed_from_tiff(self):
        stored={(r['code'],r['year']):r for r in self.rows}
        for year in range(2020,2026):
            with rasterio.open(ROOT/f'data/gee/rasters/indices_{year}_120m.tif') as ds: computed=zonal(ds,features())
            for r in computed:
                for k in ('lst','ndvi','tvdi'):
                    self.assertEqual(r[k],stored[r['code'],year][k])
                    self.assertEqual(r[k+'_pixels'],stored[r['code'],year][k+'_pixels'])
    def test_landcover_10m_statistics(self):
        cover=read(ROOT/'public/data/gee/landcover_stats.json')
        self.assertEqual(len(cover),167)
        self.assertEqual(self.product['context']['worldcover']['stats_resolution_m'],10)
        for r in cover:
            self.assertLessEqual(r['valid_pixels'],r['sampled_pixels'])
            self.assertEqual(sum(c['pixels'] for c in r['classes']),r['valid_pixels'])
            if r['valid_pixels']:self.assertAlmostEqual(sum(c['percent'] for c in r['classes']),100)
        with rasterio.open(ROOT/'data/gee/rasters/worldcover_2021_10m.tif') as ds:
            self.assertEqual(ds.nodata,0);self.assertEqual(ds.res,(10.,10.))
    def test_api_does_not_substitute_legacy_years(self):
        # Simulate a missing GEE layer in an isolated fixture, not in user files.
        with tempfile.TemporaryDirectory(prefix='gee_missing_fixture_') as folder:
            task_root=Path(folder);target=task_root/'public/data/gee/products.json';target.parent.mkdir(parents=True)
            partial={'query':{k:v for k,v in self.product['query'].items() if not k.endswith('_2020') and not k.startswith('change_')}}
            target.write_text(json.dumps(partial),encoding='utf-8')
            # Product metadata is now SQL-backed, not loaded from fixture JSON.
            with patch.object(self.module.db,'document',return_value=partial):
                absent=self.get('/api/sample?lat=10.77&lon=106.69&year=2020&index=lst&source=gee')
                self.assertEqual(absent['status'],'unavailable');self.assertIsNone(absent['value'])
                absent=self.get('/api/sample?lat=10.77&lon=106.69&year=2025&index=lst&source=gee&change=1')
                self.assertEqual(absent['status'],'unavailable')
        legacy=self.get('/api/sample?lat=10.77&lon=106.69&year=2020&index=lst&source=legacy')
        self.assertIsNotNone(legacy['value'])
        for year in range(2020,2026):
            for k in ('lst','ndvi','tvdi'):
                q=self.product['query'][f'{k}_{year}'];a=np.fromfile(ROOT/'data/query_grid'/q['path'],dtype='<f4').reshape(q['height'],q['width'])
                y,x=np.argwhere(np.isfinite(a))[50];w,s,e,n=q['bounds'];lat=n-(y+.5)*(n-s)/q['height'];lon=w+(x+.5)*(e-w)/q['width']
                result=self.get(f'/api/sample?lat={lat}&lon={lon}&year={year}&index={k}&source=gee')
                self.assertAlmostEqual(result['value'],float(a[y,x]),places=5);self.assertEqual(result['source'],'gee')
    def test_downloads_and_whitelist(self):
        for path in ('/api/gee/rasters/indices_2025_120m.tif','/api/gee/originals/MobileGIS_scenes_2025.csv','/api/documents/gee_next_years.md'):
            with urllib.request.urlopen(self.base+path) as r:self.assertEqual(r.status,200);self.assertGreater(len(r.read()),50)
        with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(self.base+'/api/gee/originals/server.py')
    def test_future_script_configuration(self):
        script=(ROOT/'scripts/gee_mobilegis.js').read_text(encoding='utf-8')
        self.assertIn('var YEARS = [2020]',script)
        self.assertIn('var EXPORT_WORLDCOVER = false',script)
        self.assertIn('ee.Reducer.mean().unweighted()',script)
        self.assertNotIn('units.geometry(',script)
        self.assertIn('image.unmask({value:-9999',script)

    def test_change_maps_use_only_exact_valid_pixel_pairs(self):
        with rasterio.open(ROOT/'data/gee/rasters/indices_2020_120m.tif') as first, rasterio.open(ROOT/'data/gee/rasters/indices_2025_120m.tif') as last:
            self.assertEqual(first.transform,last.transform);self.assertEqual(first.crs,last.crs)
            a=first.read();b=last.read()
            for i,k in enumerate(('ndvi','lst','tvdi')):
                pair=(a[i]!=-9999)&(b[i]!=-9999)&np.isfinite(a[i])&np.isfinite(b[i])
                with rasterio.open(ROOT/f'data/gee/rasters/change_{k}_2020_2025_120m.tif') as ds:
                    actual=ds.read(1)
                    self.assertEqual(ds.transform,last.transform)
                    self.assertTrue(np.array_equal(actual[pair],(b[i]-a[i])[pair]))
                    self.assertTrue(np.all(actual[~pair]==-9999))
                self.assertEqual(int(pair.sum()),self.product['change'][k]['valid_pairs'])
                q=self.product['query']['change_'+k];grid=np.fromfile(ROOT/'data/query_grid'/q['path'],dtype='<f4').reshape(q['height'],q['width'])
                y,x=np.argwhere(np.isfinite(grid))[50];w,s,e,n=q['bounds']
                lat=n-(y+.5)*(n-s)/q['height'];lon=w+(x+.5)*(e-w)/q['width']
                value=self.get(f'/api/sample?lat={lat}&lon={lon}&year=2025&index={k}&source=gee&change=1')
                self.assertAlmostEqual(value['value'],float(grid[y,x]),places=5)

    def test_scene_metadata_and_valid_value_ranges(self):
        for year in range(2020,2026):
            audit=self.product['audits'][str(year)];scenes=audit['scenes']
            self.assertEqual(len(scenes),4)
            self.assertEqual(len({s['LANDSAT_PRODUCT_ID'] for s in scenes}),4)
            for s in scenes:
                self.assertTrue(s['acquisition_date'].startswith(str(year)))
                self.assertTrue(1<=int(s['acquisition_date'][5:7])<=4)
                self.assertEqual(s['tvdi_status'],'experimental_fit')
                self.assertGreaterEqual(int(s['tvdi_bins']),6)
            with rasterio.open(ROOT/f'data/gee/rasters/indices_{year}_120m.tif') as ds:
                for band,(lo,hi) in zip(ds.read(),[(-1,1),(-10,70),(0,1)]):
                    values=band[band!=-9999];self.assertGreaterEqual(float(values.min()),lo);self.assertLessEqual(float(values.max()),hi)

    def test_independent_shapely_pixel_centre_statistics(self):
        from shapely.geometry import shape
        from shapely import contains_xy
        from rasterio.features import geometry_window
        from rasterio.warp import transform_geom
        units=[f for f in features() if f[0] in ('26743','25942','27664')]
        stored={(r['code'],r['year']):r for r in self.rows}
        for year in (2020,2022,2024,2025):
            with rasterio.open(ROOT/f'data/gee/rasters/indices_{year}_120m.tif') as ds:
                for code,name,geometry in units:
                    geom=transform_geom('EPSG:4326',ds.crs,geometry);win=geometry_window(ds,[geom]);arr=ds.read(window=win)
                    rr,cc=np.indices(arr.shape[1:]);affine=ds.window_transform(win)
                    xx=affine.c+(cc+.5)*affine.a;yy=affine.f+(rr+.5)*affine.e
                    inside=contains_xy(shape(geom),xx,yy);expected=stored[code,year]
                    self.assertEqual(int(inside.sum()),expected['sampled_pixels'])
                    for i,k in enumerate(('ndvi','lst','tvdi')):
                        values=arr[i][inside];values=values[(values!=-9999)&np.isfinite(values)]
                        self.assertEqual(int(values.size),expected[k+'_pixels'])
                        if expected[k] is not None:self.assertAlmostEqual(float(values.astype('float64').mean()),expected[k],places=10)

if __name__=='__main__':unittest.main(verbosity=2)
