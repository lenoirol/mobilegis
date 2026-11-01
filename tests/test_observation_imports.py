"""Admin data import: validation, merge and overlay rules (pure functions, no database needed)."""
import sys, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
import observation_imports as oi
from auth import AuthError

CODES = {'26743', '25750', '26740'}
HEAD = 'code,year,sampled_pixels,lst,lst_pixels,ndvi,ndvi_pixels,tvdi,tvdi_pixels,dates\n'


class ParseTests(unittest.TestCase):
    def test_valid_rows_and_dates(self):
        rows, errors = oi.parse(HEAD + '25750,2025,1249,36.2,700,0.31,700,0.55,690,2025-02-20;2025-04-18\n', CODES)
        self.assertEqual(errors, [])
        self.assertEqual(rows[0]['lst_pixels'], 700)
        self.assertEqual(rows[0]['dates'], ['2025-02-20', '2025-04-18'])

    def test_rejects_unknown_commune_year_range_and_inconsistent_pixels(self):
        text = (HEAD + '99999,2025,100,36,50,0.3,50,0.5,50,\n' + '25750,2031,100,36,50,0.3,50,0.5,50,\n' + '25750,2025,100,99,50,0.3,50,0.5,50,\n'
                + '25750,2024,100,36,500,0.3,50,0.5,50,\n' + '26743,2024,100,36,,0.3,50,0.5,50,\n')
        rows, errors = oi.parse(text, CODES)
        self.assertEqual(rows, [])
        joined = ' | '.join(errors)
        for expect in ('không thuộc 167', 'ngoài 2020–2025', 'ngoài khoảng', 'lớn hơn sampled_pixels', 'có giá trị nhưng'):
            self.assertIn(expect, joined)

    def test_duplicates_missing_columns_and_size(self):
        _, errors = oi.parse(HEAD + '25750,2025,100,36,50,,,,,\n25750,2025,100,36,50,,,,,\n', CODES)
        self.assertTrue(any('trùng' in e for e in errors))
        with self.assertRaises(AuthError):
            oi.parse('code,year\n25750,2025\n', CODES)
        with self.assertRaises(AuthError):
            oi.parse(HEAD + 'x' * 1_100_000, CODES)

    def test_blank_index_is_left_untouched_and_zero_pixels_mean_no_data(self):
        rows, errors = oi.parse(HEAD + '25750,2025,100,36.5,60,,,,,\n26743,2025,100,,0,,,,,\n', CODES)
        self.assertEqual(errors, [])
        self.assertNotIn('ndvi', rows[0])
        self.assertEqual((rows[1]['lst'], rows[1]['lst_pixels']), (None, 0))


class MergeTests(unittest.TestCase):
    BASE = {'code': '25750', 'year': 2025, 'name': 'Phường Phú Lợi', 'sampled_pixels': 1249, 'lst': 33.0, 'lst_pixels': 147, 'lst_coverage': 147 / 1249,
            'ndvi': 0.3, 'ndvi_pixels': 147, 'ndvi_coverage': 147 / 1249, 'dates': ['2025-02-05'], 'source': 'GEE · Landsat'}

    def test_merge_recomputes_coverage_keeps_other_fields_and_never_mutates(self):
        change = {'code': '25750', 'year': 2025, 'sampled_pixels': 1249, 'lst': 34.1, 'lst_pixels': 800, 'dates': ['2025-02-20']}
        before = dict(self.BASE)
        out = oi.merge_row(self.BASE, change, 3)
        self.assertEqual(self.BASE, before)
        self.assertAlmostEqual(out['lst_coverage'], 800 / 1249)
        self.assertEqual(out['ndvi'], 0.3)
        self.assertEqual(out['dates'], ['2025-02-05', '2025-02-20'])
        self.assertIn('nhập #3', out['source'])

    def test_overlay_order_later_import_wins_and_new_rows_are_added_sorted(self):
        imports = [{'id': 1, 'rows': [{'code': '25750', 'year': 2025, 'sampled_pixels': 1249, 'lst': 34.0, 'lst_pixels': 700}]},
                   {'id': 2, 'rows': [{'code': '25750', 'year': 2025, 'sampled_pixels': 1249, 'lst': 35.0, 'lst_pixels': 900},
                                      {'code': '26743', 'year': 2024, 'sampled_pixels': 50, 'lst': 38.0, 'lst_pixels': 50}]}]
        rows = oi.apply_overlay([self.BASE], imports, {'26743': 'Phường Bến Thành'})
        by = {(r['code'], r['year']): r for r in rows}
        self.assertEqual(by[('25750', 2025)]['lst'], 35.0)
        self.assertEqual(by[('26743', 2024)]['name'], 'Phường Bến Thành')
        self.assertEqual([(r['year'], r['code']) for r in rows], sorted((r['year'], r['code']) for r in rows))

    def test_no_imports_returns_the_published_rows_unchanged(self):
        rows = [self.BASE]
        self.assertIs(oi.apply_overlay(rows, []), rows)


if __name__ == '__main__':
    unittest.main()


# ---------------------------------------------------------------- admin API against the real database
import auth_support as support
from fastapi.testclient import TestClient
import database as db
import server


class ImportApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.created, cls.imports = [], []

    @classmethod
    def tearDownClass(cls):
        with db.connect() as c:
            for i in cls.imports:
                c.execute('DELETE FROM mobilegis.observation_imports WHERE id=%s', (i,))
        db.clear_cache()
        for user_id in cls.created:
            support.delete_user(user_id)

    def setUp(self):
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def login(self, role):
        email, user_id = support.create_user(role)
        self.created.append(user_id)
        return support.sign_in(self.client, email)

    def rows_2025(self):
        return {r['code']: r for r in self.client.get('/data/gee_recovery/observations.json').json() if r['year'] == 2025}

    def test_only_admin_can_use_import_and_real_batch2_file_is_valid(self):
        csv_text = (ROOT / 'data/gee_recovery/batch2_20261101_review/nhap_so_lieu_dot2.csv').read_text(encoding='utf-8')
        self.assertEqual(self.client.post('/api/admin/imports/preview', json={'csv': csv_text}).status_code, 401)
        user_headers = self.login('customer')
        self.assertEqual(self.client.get('/api/admin/imports').status_code, 403)
        self.assertEqual(self.client.post('/api/admin/imports/preview', headers=user_headers, json={'csv': csv_text}).status_code, 403)
        headers = self.login('admin')
        preview = self.client.post('/api/admin/imports/preview', headers=headers, json={'csv': csv_text}).json()
        self.assertEqual(preview['error_count'], 0, preview['errors'])
        self.assertEqual(preview['rows'], 27)
        self.assertEqual(preview['rows'], preview['changed_rows'] + sum(1 for c in preview['changes'] if not c['diff']))   # 0 changes is fine when this batch is already applied
        self.assertEqual(self.client.get('/api/admin/imports/template.csv').status_code, 200)

    def test_apply_changes_served_rows_and_revert_restores_them(self):
        headers = self.login('admin')
        before = self.rows_2025()['25750']
        text = 'code,year,sampled_pixels,lst,lst_pixels,ndvi,ndvi_pixels,tvdi,tvdi_pixels,dates\n25750,2025,1249,35.5,800,0.4,800,0.5,790,2025-02-20\n'
        bad = self.client.post('/api/admin/imports', headers=headers, json={'csv': text.replace('35.5', '99'), 'filename': 'bad.csv'})
        self.assertEqual(bad.status_code, 400)
        done = self.client.post('/api/admin/imports', headers=headers, json={'csv': text, 'filename': 'thu.csv', 'note': 'kiểm thử'})
        self.assertEqual(done.status_code, 200, done.text)
        import_id = done.json()['id']
        self.imports.append(import_id)
        after = self.rows_2025()['25750']
        self.assertEqual(after['lst'], 35.5)
        self.assertAlmostEqual(after['lst_coverage'], 800 / 1249)
        self.assertIn('2025-02-20', after['dates'])
        self.assertEqual(self.client.get('/api/research/observations?source=gee_recovery&year=2025&code=25750').json()[0]['lst'], 35.5)
        self.assertEqual(self.client.post(f'/api/admin/imports/{import_id}/revert', headers=headers).status_code, 200)
        self.assertEqual(self.rows_2025()['25750']['lst'], before['lst'])
        self.assertEqual(self.client.post(f'/api/admin/imports/{import_id}/reapply', headers=headers).status_code, 200)
        self.assertEqual(self.rows_2025()['25750']['lst'], 35.5)
        self.assertEqual(self.client.post(f'/api/admin/imports/{import_id}/revert', headers=headers).status_code, 200)
        self.assertEqual(self.rows_2025()['25750']['lst'], before['lst'])
        self.assertEqual(self.client.post('/api/admin/imports/999999/revert', headers=headers).status_code, 404)
        events = ' '.join(e['event'] for e in self.client.get('/api/admin/events', headers=headers).json())
        self.assertIn('data_import', events)

    def test_usage_counters_accept_new_feature_hits_and_reject_junk(self):
        self.assertEqual(self.client.post('/api/hit', json={'kind': 'feature', 'key': '3d'}).status_code, 200)
        self.assertEqual(self.client.post('/api/hit', json={'kind': 'error', 'key': 'js'}).status_code, 200)
        self.assertEqual(self.client.post('/api/hit', json={'kind': 'feature', 'key': '<script>'}).status_code, 400)
        headers = self.login('admin')
        usage = self.client.get('/api/admin/usage', headers=headers).json()
        self.assertIn('features', usage)
        self.assertIn('errors', usage)
