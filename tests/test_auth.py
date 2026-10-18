"""Accounts, roles, CSRF and password reset against the real PostgreSQL (throw-away users)."""
import sys, unittest, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import auth, auth_support as support, database as db, server
from fastapi.testclient import TestClient
from auth_support import PASSWORD

NEW_PASSWORD = 'Another-pass-5678'


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.created = []

    def setUp(self):
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    @classmethod
    def tearDownClass(cls):
        for user_id in cls.created:
            support.delete_user(user_id)

    def user(self, role='customer'):
        email, user_id = support.create_user(role)
        self.created.append(user_id)
        return email, user_id

    # ---- registration and login -----------------------------------------------------
    def test_register_logs_in_and_never_returns_secrets(self):
        email = f'test-{uuid.uuid4().hex[:12]}@example.test'
        response = self.client.post('/api/auth/register', json={'email': email.upper(), 'display_name': 'Người dùng', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.created.append(body['user']['id'])
        self.assertEqual(body['user']['email'], email)
        self.assertEqual(body['user']['role'], 'customer')
        self.assertNotIn('password', response.text.lower())
        self.assertIn('httponly', response.headers['set-cookie'].lower())
        self.assertEqual(self.client.get('/api/auth/me').json()['user']['email'], email)
        with db.connect() as c:
            stored = c.execute('SELECT password_hash FROM mobilegis.app_users WHERE email=%s', (email,)).fetchone()['password_hash']
        self.assertTrue(stored.startswith('scrypt$'))
        self.assertNotIn(PASSWORD, stored)

    def test_register_validation_and_duplicates(self):
        email, _ = self.user()
        post = lambda **kw: self.client.post('/api/auth/register', json={'email': 'x@example.test', 'display_name': 'A', 'password': PASSWORD, **kw})
        self.assertEqual(post(email=email).status_code, 409)
        self.assertEqual(post(email='not-an-email').status_code, 400)
        self.assertEqual(post(password='short').status_code, 400)
        self.assertEqual(post(display_name='   ').status_code, 400)
        self.assertEqual(self.client.post('/api/auth/register', content=b'[1]').status_code, 400)

    def test_login_failures_are_generic_and_lock_the_account(self):
        email, _ = self.user()
        unknown = self.client.post('/api/auth/login', json={'email': 'nobody@example.test', 'password': 'whatever123'})
        wrong = self.client.post('/api/auth/login', json={'email': email, 'password': 'whatever123'})
        self.assertEqual((unknown.status_code, wrong.status_code), (401, 401))
        self.assertEqual(unknown.json(), wrong.json())
        for _ in range(auth.MAX_FAILED_LOGINS - 1):
            self.client.post('/api/auth/login', json={'email': email, 'password': 'whatever123'})
        locked = self.client.post('/api/auth/login', json={'email': email, 'password': PASSWORD})
        self.assertEqual(locked.status_code, 429)

    def test_logout_ends_the_session(self):
        email, _ = self.user()
        support.sign_in(self.client, email)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        self.client.post('/api/auth/logout')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_session_endpoint_for_guest_and_user(self):
        self.assertEqual(self.client.get('/api/session').json(), {'token': '', 'user': None})
        email, _ = self.user()
        headers = support.sign_in(self.client, email)
        data = self.client.get('/api/session').json()
        self.assertEqual(data['token'], headers['X-Token'])
        self.assertEqual(data['user']['email'], email)

    # ---- permissions ----------------------------------------------------------------
    def test_guest_can_read_but_not_write_or_admin(self):
        self.assertEqual(self.client.get('/api/research/observations?year=2025&code=25750').status_code, 200)
        self.assertEqual(self.client.post('/api/save', json={}).status_code, 401)
        self.assertEqual(self.client.post('/api/analysis/simulate', json={}).status_code, 401)
        self.assertEqual(self.client.get('/api/admin/users').status_code, 401)

    def test_customer_cannot_write_or_administer(self):
        email, _ = self.user('customer')
        headers = support.sign_in(self.client, email)
        self.assertEqual(self.client.post('/api/save', json={}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post('/api/analysis/simulate', json={}, headers=headers).status_code, 403)
        self.assertEqual(self.client.get('/api/admin/users').status_code, 403)
        self.assertEqual(self.client.get('/api/admin/events').status_code, 403)
        self.assertEqual(self.client.get('/api/research/observations?year=2025&code=25750').status_code, 200)

    def test_admin_writes_require_csrf_header(self):
        email, _ = self.user('admin')
        headers = support.sign_in(self.client, email)
        self.assertEqual(self.client.post('/api/analysis/simulate', json={'lst_delta': 11}).status_code, 403)
        self.assertEqual(self.client.post('/api/analysis/simulate', json={'lst_delta': 11}, headers={'X-Token': 'wrong'}).status_code, 403)
        self.assertEqual(self.client.post('/api/analysis/simulate', json={'lst_delta': 11}, headers=headers).status_code, 400)

    # ---- administration -------------------------------------------------------------
    def test_admin_manages_roles_and_protects_the_last_admin(self):
        admin_email, admin_id = self.user('admin')
        _, other_admin_id = self.user('admin')
        _, member_id = self.user('customer')
        headers = support.sign_in(self.client, admin_email)
        listing = self.client.get('/api/admin/users').json()
        self.assertTrue({admin_id, member_id} <= {u['id'] for u in listing})
        self.assertNotIn('password_hash', self.client.get('/api/admin/users').text)
        role = lambda uid, r: self.client.post(f'/api/admin/users/{uid}/role', json={'role': r}, headers=headers)
        self.assertEqual(role(member_id, 'admin').status_code, 200)
        self.assertEqual(role(member_id, 'customer').status_code, 200)
        self.assertEqual(role(member_id, 'superuser').status_code, 400)
        self.assertEqual(role(999999999, 'customer').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/admin/users/{admin_id}', headers=headers).status_code, 409)
        # With the other test admin disabled, demoting/deactivating must not remove the last one.
        with db.connect() as c:
            others = c.execute("SELECT id FROM mobilegis.app_users WHERE role='admin' AND is_active AND id<>%s", (admin_id,)).fetchall()
        for row in others:
            self.client.post(f'/api/admin/users/{row["id"]}/active', json={'active': False}, headers=headers)
        try:
            self.assertEqual(role(admin_id, 'customer').status_code, 409)
            self.assertEqual(self.client.post(f'/api/admin/users/{admin_id}/active', json={'active': False}, headers=headers).status_code, 409)
        finally:
            for row in others:
                self.client.post(f'/api/admin/users/{row["id"]}/active', json={'active': True}, headers=headers)

    def test_deactivated_user_loses_session_and_cannot_login(self):
        admin_email, _ = self.user('admin')
        member_email, member_id = self.user()
        member = TestClient(server.app)
        member.__enter__()
        self.addCleanup(member.__exit__, None, None, None)
        support.sign_in(member, member_email)
        headers = support.sign_in(self.client, admin_email)
        self.assertEqual(self.client.post(f'/api/admin/users/{member_id}/active', json={'active': False}, headers=headers).status_code, 200)
        self.assertEqual(member.get('/api/auth/me').status_code, 401)
        self.assertEqual(member.post('/api/auth/login', json={'email': member_email, 'password': PASSWORD}).status_code, 403)

    # ---- password change and reset ------------------------------------------------
    def test_change_password_revokes_other_sessions(self):
        email, _ = self.user()
        first = TestClient(server.app)
        first.__enter__()
        self.addCleanup(first.__exit__, None, None, None)
        support.sign_in(first, email)
        headers = support.sign_in(self.client, email)
        change = lambda current: self.client.post('/api/auth/change-password', headers=headers,
                                                  json={'current_password': current, 'new_password': NEW_PASSWORD})
        self.assertEqual(change('wrong-password').status_code, 403)
        self.assertEqual(change(PASSWORD).status_code, 200)
        self.assertEqual(first.get('/api/auth/me').status_code, 401)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': email, 'password': NEW_PASSWORD}).status_code, 200)

    def test_forgot_password_flow_with_admin_issued_code(self):
        member_email, member_id = self.user()
        admin_email, _ = self.user('admin')
        self.assertEqual(self.client.post('/api/auth/forgot', json={'email': 'nobody@example.test'}).status_code, 200)
        self.assertEqual(self.client.post('/api/auth/forgot', json={'email': member_email}).json()['ok'], True)
        headers = support.sign_in(self.client, admin_email)
        pending = [r for r in self.client.get('/api/admin/resets').json() if r['email'] == member_email]
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]['status'], 'pending')
        reset = lambda code: TestClient(server.app).post('/api/auth/reset', json={'email': member_email, 'code': code, 'new_password': NEW_PASSWORD})
        self.assertEqual(reset('ABCD2345').status_code, 400)  # nothing issued yet
        issued = self.client.post(f'/api/admin/resets/{pending[0]["id"]}/issue', headers=headers).json()
        self.assertEqual(len(issued['code']), 8)
        with db.connect() as c:
            stored = c.execute('SELECT code_hash FROM mobilegis.password_resets WHERE id=%s', (pending[0]['id'],)).fetchone()['code_hash']
        self.assertNotIn(issued['code'], stored)
        self.assertEqual(reset('WRONG234').status_code, 400)
        self.assertEqual(reset(issued['code'].lower()).status_code, 200)  # codes are case-insensitive
        self.assertEqual(reset(issued['code']).status_code, 400)  # one-time
        self.assertEqual(self.client.post('/api/auth/login', json={'email': member_email, 'password': PASSWORD}).status_code, 401)
        member = TestClient(server.app)
        self.assertEqual(member.post('/api/auth/login', json={'email': member_email, 'password': NEW_PASSWORD}).status_code, 200)

    def test_reset_code_is_blocked_after_too_many_wrong_attempts(self):
        member_email, _ = self.user()
        admin_email, _ = self.user('admin')
        self.client.post('/api/auth/forgot', json={'email': member_email})
        headers = support.sign_in(self.client, admin_email)
        request = next(r for r in self.client.get('/api/admin/resets').json() if r['email'] == member_email)
        code = self.client.post(f'/api/admin/resets/{request["id"]}/issue', headers=headers).json()['code']
        guest = TestClient(server.app)
        for _ in range(auth.MAX_RESET_ATTEMPTS):
            guest.post('/api/auth/reset', json={'email': member_email, 'code': 'WRONG234', 'new_password': NEW_PASSWORD})
        self.assertEqual(guest.post('/api/auth/reset', json={'email': member_email, 'code': code, 'new_password': NEW_PASSWORD}).status_code, 400)

    def test_admin_events_record_security_actions(self):
        email, _ = self.user('admin')
        support.sign_in(self.client, email)
        events = {e['event'] for e in self.client.get('/api/admin/events').json()}
        self.assertTrue({'register', 'login'} <= events)


if __name__ == '__main__':
    unittest.main()
