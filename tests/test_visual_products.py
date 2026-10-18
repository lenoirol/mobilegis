"""Validate new local map products without changing the demo database."""
import importlib.util, io, json, math, struct, sys, threading, unittest, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
import numpy as np
import rasterio
from rasterio.warp import reproject
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from PIL import Image

def read(path):return json.loads(path.read_text(encoding='utf8'))

class VisualProducts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location('visual_server',ROOT/'server.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        from http_support import HTTPTestServer
        cls.server=HTTPTestServer(module.app)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.products=read(ROOT/'public/data/visual_products.json')
        cls.query=read(ROOT/'data/query_grid/metadata.json')
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def get(self,path):
        with urllib.request.urlopen(self.base+path) as r:return json.load(r)
    def test_24_layers_have_complete_xyz_metadata(self):
        layers=list(self.products['context'].values())+list(self.products['change'].values())
        layers.extend(v for year in self.products['absolute'].values() for v in year.values())
        self.assertEqual(len(layers),24)
        for layer in layers:
            key=layer['url'].split('/')[3];folder=ROOT/'public/data/tiles'/key
            self.assertEqual(len(list(folder.glob('*/*/*.png'))),layer['tiles'])
            self.assertEqual(layer['max_native_zoom'],12)
            sample=next(folder.glob('12/*/*.png'))
            with Image.open(sample) as image:
                self.assertEqual(image.size,(256,256));self.assertEqual(image.mode,'RGBA')
    def test_worldcover_source_and_statistics(self):
        rows=read(ROOT/'public/data/landcover_stats.json')
        self.assertEqual(len(rows),167)
        self.assertEqual(self.products['context']['worldcover']['year'],2021)
        self.assertEqual(self.products['context']['worldcover']['source_resolution_m'],10)
        for row in rows:
            self.assertEqual(sum(c['pixels'] for c in row['classes']),row['valid_pixels'])
            if row['valid_pixels']:self.assertAlmostEqual(sum(c['percent'] for c in row['classes']),100,delta=.06)
            self.assertLessEqual(row['valid_pixels'],row['sampled_pixels'])
    def test_change_grid_only_valid_pairs(self):
        for k in ('lst','ndvi','tvdi'):
            a=np.fromfile(ROOT/'data/query_grid'/self.query[k+'_2020']['path'],dtype='<f4')
            b=np.fromfile(ROOT/'data/query_grid'/self.query[k+'_2025']['path'],dtype='<f4')
            delta=np.fromfile(ROOT/'data/query_grid'/self.query['change_'+k]['path'],dtype='<f4')
            self.assertTrue(np.array_equal(np.isfinite(delta),np.isfinite(a)&np.isfinite(b)))
            valid=np.isfinite(delta);np.testing.assert_allclose(delta[valid],(b-a)[valid],atol=1e-5)
    def test_query_resampling_matches_original_geotiff(self):
        for k in ('lst','ndvi','tvdi'):
            meta=self.query[k+'_2025'];dest=np.full((meta['height'],meta['width']),np.nan,dtype='float32')
            with rasterio.open(ROOT/f'data/rasters/{k}_2025_120m.tif') as src:
                reproject(src.read(1),dest,src_transform=src.transform,src_crs=src.crs,
                    src_nodata=src.nodata,dst_transform=from_bounds(*meta['bounds'],meta['width'],meta['height']),
                    dst_crs='EPSG:4326',dst_nodata=np.nan,resampling=Resampling.nearest)
            stored=np.fromfile(ROOT/'data/query_grid'/meta['path'],dtype='<f4').reshape(dest.shape)
            np.testing.assert_allclose(dest,stored,equal_nan=True,atol=1e-5)
    def test_point_api_values_null_and_validation(self):
        meta=self.query['lst_2025'];array=np.fromfile(ROOT/'data/query_grid'/meta['path'],dtype='<f4').reshape(meta['height'],meta['width'])
        w,s,e,n=meta['bounds']
        for valid in (True,False):
            y,x=np.argwhere(np.isfinite(array) if valid else ~np.isfinite(array))[10]
            lat=n-(y+.5)*(n-s)/meta['height'];lon=w+(x+.5)*(e-w)/meta['width']
            actual=self.get(f'/api/sample?lat={lat}&lon={lon}&year=2025&index=lst')['value']
            if valid:self.assertAlmostEqual(actual,float(array[y,x]),places=5)
            else:self.assertIsNone(actual)
        self.assertIsNone(self.get('/api/sample?lat=0&lon=0&year=2025&index=lst')['value'])
        with self.assertRaises(urllib.error.HTTPError) as error:self.get('/api/sample?lat=nan&lon=0&year=2025&index=lst')
        self.assertEqual(error.exception.code,400)
        self.assertIn('2026.10',self.get('/api/info')['version'])
    def test_sparse_tile_is_transparent_not_zero_value(self):
        with urllib.request.urlopen(self.base+'/data/tiles/lst_2025/12/0/0.png') as r:
            self.assertEqual(r.status,200)
            with Image.open(io.BytesIO(r.read())) as image:self.assertEqual(image.convert('RGBA').getpixel((0,0))[3],0)
    def test_context_and_change_geotiff_downloads(self):
        names=['worldcover_2021_120m.tif','rgb_2025_120m.tif']+[f'change_{k}_2020_2025_120m.tif' for k in ('lst','ndvi','tvdi')]
        for name in names:
            with urllib.request.urlopen(self.base+'/api/rasters/'+name) as r:
                self.assertEqual(r.status,200);self.assertTrue(r.read().startswith(b'II'))
    def test_documents_and_gee_boundary_zip(self):
        import zipfile
        with urllib.request.urlopen(self.base+'/api/documents/quickstart.md') as r:
            self.assertIn('2026.10',r.read().decode('utf8'))
        with urllib.request.urlopen(self.base+'/api/documents/hcm167_GEE.zip') as r:
            with zipfile.ZipFile(io.BytesIO(r.read())) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()),{'hcm167.'+ext for ext in ('shp','shx','dbf','prj','cpg')})
        with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(self.base+'/api/documents/server.py')
        self.assertEqual(error.exception.code,404)

if __name__=='__main__':unittest.main(verbosity=2)
