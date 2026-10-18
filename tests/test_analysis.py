"""PG3 integration, original-data invariants and explicit simulation isolation."""
import json,math,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
import database as db,analysis,server
from fastapi.testclient import TestClient

class NoCommit:
    def __init__(self,c):self.c=c
    def __enter__(self):return self.c
    def __exit__(self,*args):return False

class AnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.client=TestClient(server.app);cls.client.__enter__()
    @classmethod
    def tearDownClass(cls):cls.client.__exit__(None,None,None)
    def test_statistics_populations_preserved(self):
        with db.connect() as c:
            self.assertEqual(c.execute('SELECT count(*) AS n FROM mobilegis.pixel_statistics').fetchone()['n'],9018)
            for k in analysis.INDICES:
                n=c.execute(f'''SELECT count(*) AS n FROM mobilegis.pixel_statistics s JOIN mobilegis.{k}_observations o USING(dataset_id,code,year)
                WHERE s.index_name=%s AND (s.valid_count<>o.valid_pixels OR s.sample_count<>o.sampled_pixels OR (o.{k} IS NOT NULL AND abs(s.mean-o.{k})>0.0001))''',(k,)).fetchone()['n']
                self.assertEqual(n,0)
    def test_statistics_filters_and_quantiles(self):
        r=self.client.get('/api/analysis/statistics?source=gee_recovery&year=2025&index=lst&code=26743').json()
        self.assertEqual(len(r['units']),1);s=r['units'][0]
        self.assertLessEqual(s['minimum'],s['q25']);self.assertLessEqual(s['q25'],s['median'])
        self.assertLessEqual(s['median'],s['q75']);self.assertLessEqual(s['q75'],s['maximum'])
        self.assertEqual(sum(s['histogram']['counts']),s['valid_count'])
        self.assertGreaterEqual(s['stddev'],0)
    def test_all_index_sources_respond_and_keep_nulls(self):
        for source in db.SOURCES:
            for k in analysis.INDICES:
                response=self.client.get(f'/api/analysis/statistics?source={source}&year=2025&index={k}&coverage=0')
                self.assertEqual(response.status_code,200);self.assertEqual(len(response.json()['units']),167)
        rows=self.client.get('/api/analysis/statistics?source=gee&year=2025&index=lst&coverage=0').json()['units']
        # Raw pixel statistics may exist even when a published mean is withheld
        # for insufficient coverage; never fabricate a published observation.
        observed=db.observations('gee',2025)
        self.assertTrue(any(r['lst'] is None for r in observed))
        self.assertTrue(all(r['mean'] is None for r in rows if r['valid_count']==0))
    def test_landcover_weighted_means(self):
        r=self.client.get('/api/analysis/landcover?index=lst&year=2025').json()
        self.assertEqual(r['reference_year'],2021);self.assertEqual(r['sample_resolution_m'],120)
        self.assertGreater(len(r['classes']),4)
        self.assertTrue(all(c['valid_count']>0 and math.isfinite(c['mean']) for c in r['classes']))
    def test_correlation_domain_and_pair_sample_counts(self):
        r=self.client.get('/api/analysis/correlations?year=2025').json()
        self.assertEqual(len(r['pairs']),3)
        self.assertTrue(all(p['n']>3 and -1<=p['r']<=1 and 0<=p['r_squared']<=1 for p in r['pairs']))
        self.assertIn('toán học',r['note'])
    def test_simulation_is_transactional_and_separate(self):
        original=analysis.db.observations('gee_recovery',2025)
        with db.connect() as c:
            try:
                with patch.object(db,'connect',return_value=NoCommit(c)):
                    run=analysis.simulate({'source':'gee_recovery','base_year':2025,'target_year':2026,'lst_delta':1,'ndvi_delta':.05,'tvdi_delta':-.05})
                    result=analysis.results(run['id']);self.assertEqual(result['run']['result_kind'],'simulation')
                    self.assertEqual(len(result['units']),167)
                    row=next(r for r in result['units'] if r['code']=='26743');base=next(r for r in original if r['code']=='26743')
                    self.assertAlmostEqual(row['lst'],base['lst']+1)
                    self.assertEqual(analysis.db.observations('gee_recovery',2025),original)
                    self.assertTrue(any(r['lst'] is None and r['lst_status']=='insufficient_base_coverage' for r in result['units']))
                    count=c.execute('SELECT count(*) AS n FROM mobilegis.model_evaluations WHERE run_id=%s',(run['id'],)).fetchone()['n']
                    self.assertEqual(count,0)
            finally:c.rollback()
    def test_simulation_clipping_is_explicit(self):
        with db.connect() as c:
            try:
                with patch.object(db,'connect',return_value=NoCommit(c)):
                    run=analysis.simulate({'ndvi_delta':1,'tvdi_delta':1})
                    result=analysis.results(run['id'])
                    self.assertTrue(any(r['ndvi_status']=='clipped' and r['ndvi']==1 for r in result['units']))
                    self.assertTrue(all(r['tvdi'] is None or 0<=r['tvdi']<=1 for r in result['units']))
            finally:c.rollback()
    def test_api_rejects_unsafe_or_unknown_inputs(self):
        self.assertEqual(self.client.get('/api/analysis/statistics?index=xxx').status_code,400)
        self.assertEqual(self.client.get('/api/analysis/statistics?source=other').status_code,400)
        self.assertEqual(self.client.get('/api/analysis/statistics?coverage=1.1').status_code,400)
        self.assertEqual(self.client.get('/api/analysis/runs/not-uuid').status_code,400)
        import auth_support
        self.assertEqual(self.client.post('/api/analysis/simulate',json={}).status_code,401)
        email,uid=auth_support.create_user('admin');token=auth_support.sign_in(self.client,email)['X-Token']
        self.addCleanup(lambda:(self.client.post('/api/auth/logout'),auth_support.delete_user(uid)))
        self.assertEqual(self.client.post('/api/analysis/simulate',headers={'X-Token':token},json={'lst_delta':11}).status_code,400)
        self.assertEqual(self.client.post('/api/analysis/simulate',headers={'X-Token':token},json=[]).status_code,400)
        self.assertEqual(self.client.post('/api/analysis/simulate',headers={'X-Token':token},json={'target_year':2026.5}).status_code,400)
        self.assertEqual(self.client.post('/api/analysis/simulate',headers={'X-Token':token},json={'base_year':True}).status_code,400)
    def test_portable_statistics_seed(self):
        import csv,gzip
        from analysis_seed import FOLDER,TABLES,digest
        manifest=json.loads((FOLDER/'manifest.json').read_text(encoding='utf8'))
        for table,columns in TABLES.items():
            p=FOLDER/(table+'.csv.gz');info=manifest['tables'][table]
            self.assertEqual(info['sha256'],digest(p))
            with gzip.open(p,'rt',encoding='utf8',newline='') as f:
                reader=csv.reader(f);self.assertEqual(tuple(next(reader)),columns)
                self.assertEqual(sum(1 for r in reader),info['rows'])
    def test_forecast_storage_is_available_but_not_fabricated(self):
        with db.connect() as c:
            for table in ('analysis_runs','result_units','lst_results','ndvi_results','tvdi_results','model_evaluations'):
                self.assertIsNotNone(c.execute('SELECT to_regclass(%s) AS t',('mobilegis.'+table,)).fetchone()['t'])
            self.assertEqual(c.execute("SELECT count(*) AS n FROM mobilegis.analysis_runs WHERE result_kind='forecast'").fetchone()['n'],0)
    def test_palette_endpoints_transparent_nodata(self):
        import numpy as np
        from build_visual_products import rgba_scalar
        from build_landsat import PALETTES
        style=json.loads((ROOT/'public/data/display_styles.json').read_text(encoding='utf8'))
        for k,(lo,hi,colors) in PALETTES.items():
            a=np.array([[lo,hi,np.nan]],dtype='float32');result=rgba_scalar(a,lo,hi,colors)
            first=[int(colors[0][i:i+2],16) for i in (1,3,5)]
            last=[int(colors[-1][i:i+2],16) for i in (1,3,5)]
            self.assertEqual(list(result[0,0,:3]),first);self.assertEqual(list(result[0,1,:3]),last)
            self.assertEqual(result[0,2,3],0);self.assertEqual(style['indices'][k]['colors'],colors)

if __name__=='__main__':unittest.main(verbosity=2)
