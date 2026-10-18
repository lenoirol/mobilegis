"""Helpers that create throw-away accounts in the real database for API tests."""
import sys, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import auth
import database as db

PASSWORD = 'Test-pass-1234'


def create_user(role='customer'):
    email = f'test-{uuid.uuid4().hex[:12]}@example.test'
    user = auth.register(email, 'Test User', PASSWORD)
    if role != 'customer':
        with db.connect() as c:
            c.execute('UPDATE mobilegis.app_users SET role=%s WHERE id=%s', (role, user['id']))
    return email, user['id']


def delete_user(user_id):
    with db.connect() as c:
        c.execute('DELETE FROM mobilegis.app_users WHERE id=%s', (user_id,))


def sign_in(client, email, password=PASSWORD):
    """Log the client in (cookie is kept by the client) and return the CSRF header."""
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200, response.text
    return {'X-Token': response.json()['token']}
