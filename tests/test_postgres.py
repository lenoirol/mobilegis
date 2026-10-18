"""Integration tests against configured real PostgreSQL/PostGIS, no mock DB."""
import json,sys,unittest,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import server,database as db,psycopg
from fastapi.testclient import TestClient

class PostgreSQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client=TestClient(server.app);cls.client.__enter__()
    @classmethod
    def tearDownClass(cls):cls.client.__exit__(None,None,None)
    def test_all_source_values_and_metadata_preserved(self):
        for source,rel in [('legacy','observations_real.json'),('gee','gee/observations.json'),('gee_recovery','gee_recovery/observations.json')]:
            original=json.loads((ROOT/'public/data'/rel).read_text(encoding='utf8'))
            self.assertEqual(db.observations(source),sorted(original,key=lambda r:(r['code'],r['year'])))
    def test_points_and_migrated_demo_preserved(self):
        old=json.loads((ROOT/'public/data/observations_user.json').read_text(encoding='utf8'))
        self.assertEqual(db.points(),sorted(old,key=lambda r:(r['name'],r['year'])))
        seed=json.loads((ROOT/'database/seeds/demo_legacy.json').read_text(encoding='utf8'))['rows']
        self.assertEqual(sorted(db.demo(),key=lambda r:r['id']),seed)
    def test_spatial_geometries_and_query(self):
        with db.connect() as c:
            self.assertEqual(c.execute('SELECT count(*) AS n FROM mobilegis.admin_units WHERE ST_IsValid(geom) AND ST_SRID(geom)=4326').fetchone()['n'],167)
        units=self.client.get('/api/units?lat=10.41&lon=106.96').json()['features']
        self.assertIn('27664',[f['id'] for f in units])
        self.assertEqual(len(db.boundaries()['features']),167)
        self.assertEqual(self.client.get('/api/units?lat=0').status_code,400)
    def test_readonly_research_and_audit_permissions(self):
        with db.connect() as c:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                c.execute("UPDATE mobilegis.lst_observations SET lst=lst WHERE dataset_id='gee' AND code='25942' AND year=2025")
            c.rollback()
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):c.execute('DELETE FROM mobilegis.audit_log WHERE false')
            c.rollback()
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                c.execute("INSERT INTO mobilegis.audit_log(operation,record_id) VALUES('FORGED',0)")
            c.rollback()
    def test_demo_transaction_audit_and_rollback(self):
        with db.connect() as c:
            before=c.execute('SELECT count(*) AS n FROM mobilegis.audit_log').fetchone()['n']
            record=c.execute("INSERT INTO mobilegis.demo_observations(name,lat,lon,year,lst,ndvi,tvdi,source) VALUES(%s,10,106,2025,35,.3,.5,'integration test') RETURNING id",('TEST_'+uuid.uuid4().hex,)).fetchone()['id']
            self.assertEqual(c.execute('SELECT operation FROM mobilegis.audit_log WHERE record_id=%s ORDER BY id DESC LIMIT 1',(record,)).fetchone()['operation'],'INSERT')
            actor=c.execute('SELECT actor FROM mobilegis.audit_log WHERE record_id=%s ORDER BY id DESC LIMIT 1',(record,)).fetchone()['actor']
            self.assertEqual(actor,c.execute('SELECT session_user AS u').fetchone()['u'])
            with self.assertRaises(psycopg.errors.CheckViolation):c.execute('UPDATE mobilegis.demo_observations SET tvdi=2 WHERE id=%s',(record,))
            c.rollback()
            self.assertEqual(c.execute('SELECT count(*) AS n FROM mobilegis.audit_log').fetchone()['n'],before)
            self.assertIsNone(c.execute('SELECT id FROM mobilegis.demo_observations WHERE id=%s',(record,)).fetchone())
    def test_rest_demo_crud_and_input_isolation(self):
        import auth_support
        email,uid=auth_support.create_user('admin');name='TEST_'+uuid.uuid4().hex
        point={'name':name,'lat':10.8,'lon':106.7,'year':2025,'lst':35,'ndvi':.4,'tvdi':.5,'source':'Integration test synthetic'}
        self.assertEqual(self.client.post('/api/save',json=point).status_code,401)
        try:
            headers=auth_support.sign_in(self.client,email)
            self.assertEqual(self.client.post('/api/save',json=point,headers=headers).status_code,200)
            saved=next(r for r in db.demo() if r['name']==name);point['id']=saved['id'];point['lst']=36
            self.assertEqual(self.client.post('/api/save',json=point,headers=headers).status_code,200)
            self.assertEqual(next(r for r in db.demo() if r['name']==name)['lst'],36)
            # Static routing may return 405 for an unsupported HTTP method;
            # either response must reject research writes, with data unchanged.
            before=db.observations('gee_recovery',2025,'25942')
            self.assertIn(self.client.post('/api/research/save',json=point,headers=headers).status_code,(404,405))
            self.assertEqual(db.observations('gee_recovery',2025,'25942'),before)
        finally:
            for r in db.demo():
                if r['name']==name:self.client.post('/api/delete',json={'id':r['id']},headers=headers)
            self.client.post('/api/auth/logout');auth_support.delete_user(uid)
    def test_missing_values_and_2025_recovery_separate(self):
        base=self.client.get('/api/research/observations?source=gee&code=25942&year=2025').json()[0]
        recovered=self.client.get('/api/research/observations?source=gee_recovery&code=25942&year=2025').json()[0]
        self.assertIsNone(base['lst']);self.assertAlmostEqual(recovered['lst'],43.078090420403775)
        self.assertEqual(len(self.client.get('/api/research/observations?year=2025&index=lst&coverage=0.5').json()),158)
    def test_screening_has_threshold_coverage_and_experimental_label(self):
        r=self.client.get('/api/research/alerts?source=gee_recovery&year=2025&threshold=0.8&coverage=0.5').json()
        self.assertEqual(r['status'],'experimental_screening_not_official_warning')
        self.assertTrue(all(x['tvdi']>=.8 and x['tvdi_coverage']>=.5 for x in r['units']))
        self.assertEqual(self.client.get('/api/research/alerts?threshold=2').status_code,400)
    def test_configuration_not_exposed_and_no_sqlite_runtime(self):
        for path in ('/config/database.local.json','/config/owner.local.json','/api/rasters/../server.py'):
            self.assertEqual(self.client.get(path).status_code,404)
        self.assertNotIn('password',self.client.get('/api/info').text.lower())
        self.assertNotIn('sqlite3',(ROOT/'server.py').read_text(encoding='utf8').lower())
    def test_asset_registry_and_health(self):
        self.assertEqual(self.client.get('/api/health').json()['schema_version'],6)
        with db.connect() as c:
            assets=c.execute('SELECT relative_path,size_bytes,sha256 FROM mobilegis.asset_catalog').fetchall()
            self.assertGreater(len(assets),40)
            self.assertTrue(all((ROOT/r['relative_path']).stat().st_size==r['size_bytes'] and len(r['sha256'])==64 for r in assets))
    def test_three_metric_tables_have_exact_original_measurements(self):
        fields={'lst':'lst','ndvi':'ndvi','tvdi':'tvdi'}
        for k in fields:
            with db.connect() as c:
                data=c.execute(f'SELECT * FROM mobilegis.{k}_observations ORDER BY dataset_id,code,year').fetchall()
                self.assertEqual(len(data),3006)
                self.assertEqual(c.execute("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema='mobilegis' AND table_name='unit_observations' AND column_name=%s",(k,)).fetchone()['n'],0)
            expected={}
            for source,rel in [('legacy','observations_real.json'),('gee','gee/observations.json'),('gee_recovery','gee_recovery/observations.json')]:
                for r in json.loads((ROOT/'public/data'/rel).read_text(encoding='utf8')):
                    expected[source,r['code'],r['year']]=r
            for r in data:
                original=expected[r['dataset_id'],r['code'],r['year']]
                self.assertEqual((r[k],r['valid_pixels'],r['sampled_pixels'],r['coverage']),(original[k],original[k+'_pixels'],original['sampled_pixels'],original[k+'_coverage']))
    def test_independent_metric_api_and_full_schema_document(self):
        for k in ('lst','ndvi','tvdi'):
            r=self.client.get(f'/api/research/indices/{k}?source=gee_recovery&year=2025&code=25942').json()[0]
            self.assertIn(k,r)
            for other in {'lst','ndvi','tvdi'}-{k}:self.assertNotIn(other,r)
            self.assertEqual(r['code'],'25942');self.assertTrue(r['dates'])
        self.assertEqual(self.client.get('/api/research/indices/not_a_metric').status_code,400)
        content=self.client.get('/api/documents/schema.sql').text
        for k in ('lst','ndvi','tvdi'):self.assertIn('CREATE TABLE IF NOT EXISTS mobilegis.'+k+'_observations',content)
    def test_original_polygons_equal_preserved_source_seed(self):
        seed=json.loads((ROOT/'database/seeds/boundaries_original.geojson').read_text(encoding='utf8'))
        with db.connect() as c:
            self.assertEqual(c.execute('SELECT count(*) AS n FROM mobilegis.admin_units WHERE geom_original IS NOT NULL AND ST_IsValid(geom_original) AND ST_SRID(geom_original)=4326').fetchone()['n'],167)
            for f in seed['features']:
                self.assertTrue(c.execute('SELECT ST_Equals(geom_original,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) AS equal FROM mobilegis.admin_units WHERE code=%s',(json.dumps(f['geometry']),f['id'])).fetchone()['equal'])
        self.assertEqual(len(self.client.get('/api/units?detail=original').json()['features']),167)

if __name__=='__main__':unittest.main(verbosity=2)
