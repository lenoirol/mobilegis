"""API tests for saved areas, feedback, site notice and admin-created accounts (real PostgreSQL, throw-away accounts)."""
import sys, unittest, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'tests'))
from fastapi.testclient import TestClient
import auth_support, database as db, server

CODE = '26743'


class Engagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.made = []
        cls.cust_email, cid = auth_support.create_user('customer'); cls.admin_email, aid = auth_support.create_user('admin'); cls.made += [cid, aid]
        cls.cust, cls.admin, cls.guest = TestClient(server.app), TestClient(server.app), TestClient(server.app)
        cls.ch, cls.ah = auth_support.sign_in(cls.cust, cls.cust_email), auth_support.sign_in(cls.admin, cls.admin_email)

    @classmethod
    def tearDownClass(cls):
        for uid in cls.made:
            auth_support.delete_user(uid)
        with db.connect() as c:
            c.execute("DELETE FROM mobilegis.site_settings WHERE key='notice'")

    def test_favorites_need_login_and_roundtrip(self):
        self.assertEqual(self.guest.get('/api/me/favorites').status_code, 401)
        self.assertEqual(self.cust.post('/api/me/favorites', json={'code': CODE}).status_code, 403)   # CSRF header missing
        self.assertEqual(self.cust.post('/api/me/favorites', json={'code': CODE}, headers=self.ch).status_code, 200)
        self.cust.post('/api/me/favorites', json={'code': CODE}, headers=self.ch)   # repeat is harmless
        self.assertEqual(self.cust.get('/api/me/favorites').json(), [CODE])
        self.assertEqual(self.admin.get('/api/me/favorites').json(), [])   # per account
        self.assertEqual(self.cust.post('/api/me/favorites', json={'code': 'abc'}, headers=self.ch).status_code, 400)
        self.assertEqual(self.cust.post('/api/me/favorites', json={'code': '00000'}, headers=self.ch).status_code, 404)
        self.assertEqual(self.cust.delete(f'/api/me/favorites/{CODE}', headers=self.ch).status_code, 200)
        self.assertEqual(self.cust.get('/api/me/favorites').json(), [])

    def test_feedback_flow_and_permissions(self):
        self.assertEqual(self.guest.post('/api/feedback', json={'kind': 'suggestion', 'message': 'xin chào'}).status_code, 401)
        self.assertEqual(self.cust.post('/api/feedback', json={'kind': 'bogus', 'message': 'nội dung hợp lệ'}, headers=self.ch).status_code, 400)
        self.assertEqual(self.cust.post('/api/feedback', json={'kind': 'data_error', 'message': 'abc'}, headers=self.ch).status_code, 400)
        marker = 'E2E ' + uuid.uuid4().hex[:8]
        response = self.cust.post('/api/feedback', json={'kind': 'data_error', 'code': CODE, 'message': marker + ' số liệu lạ'}, headers=self.ch)
        self.assertEqual(response.status_code, 200); fid = response.json()['id']
        self.assertEqual(self.cust.get('/api/admin/feedback').status_code, 403)
        rows = self.admin.get('/api/admin/feedback').json()
        mine = next(r for r in rows if r['id'] == fid); self.assertEqual(mine['status'], 'new'); self.assertEqual(mine['code'], CODE)
        self.assertEqual(self.admin.post(f'/api/admin/feedback/{fid}/status', json={'status': 'done'}, headers=self.ah).status_code, 200)
        self.assertEqual(next(r for r in self.admin.get('/api/admin/feedback').json() if r['id'] == fid)['status'], 'done')
        self.assertEqual(self.cust.post(f'/api/admin/feedback/{fid}/status', json={'status': 'new'}, headers=self.ch).status_code, 403)
        with db.connect() as c:
            c.execute('DELETE FROM mobilegis.feedback WHERE id=%s', (fid,))

    def test_feedback_rate_limit(self):
        email, uid = auth_support.create_user('customer'); self.made.append(uid)
        client = TestClient(server.app); headers = auth_support.sign_in(client, email)
        codes = [client.post('/api/feedback', json={'kind': 'suggestion', 'message': f'góp ý số {i} ok'}, headers=headers).status_code for i in range(6)]
        self.assertEqual(codes, [200] * 5 + [429])
        with db.connect() as c:
            c.execute('DELETE FROM mobilegis.feedback WHERE user_id=%s', (uid,))

    def test_notice_public_read_admin_write(self):
        self.assertEqual(self.cust.post('/api/admin/notice', json={'text': 'x'}, headers=self.ch).status_code, 403)
        self.assertEqual(self.admin.post('/api/admin/notice', json={'text': 'Bảo trì tối nay'}, headers=self.ah).status_code, 200)
        self.assertEqual(self.guest.get('/api/notice').json()['text'], 'Bảo trì tối nay')
        self.assertEqual(self.admin.post('/api/admin/notice', json={'text': 'x' * 301}, headers=self.ah).status_code, 400)
        self.admin.post('/api/admin/notice', json={'text': ''}, headers=self.ah)
        self.assertEqual(self.guest.get('/api/notice').json()['text'], '')

    def test_admin_creates_account(self):
        email = f'new-{uuid.uuid4().hex[:10]}@example.test'
        self.assertEqual(self.cust.post('/api/admin/users', json={'email': email, 'display_name': 'A', 'password': 'Mat-khau-12345'}, headers=self.ch).status_code, 403)
        self.assertEqual(self.admin.post('/api/admin/users', json={'email': email, 'display_name': 'Người mới', 'password': 'yếu'}, headers=self.ah).status_code, 400)
        response = self.admin.post('/api/admin/users', json={'email': email, 'display_name': 'Người mới', 'password': 'Mat-khau-12345', 'role': 'customer'}, headers=self.ah)
        self.assertEqual(response.status_code, 200); self.made.append(response.json()['id'])
        self.assertEqual(self.admin.post('/api/admin/users', json={'email': email, 'display_name': 'Trùng', 'password': 'Mat-khau-12345'}, headers=self.ah).status_code, 409)
        self.assertEqual(self.admin.post('/api/admin/users', json={'email': 'b' + email, 'display_name': 'X', 'password': 'Mat-khau-12345', 'role': 'root'}, headers=self.ah).status_code, 400)
        self.assertEqual(TestClient(server.app).post('/api/auth/login', json={'email': email, 'password': 'Mat-khau-12345'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
