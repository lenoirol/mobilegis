"""Accounts, sessions and password reset on PostgreSQL.

Passwords and reset codes are stored as scrypt hashes, session tokens as SHA-256.
This module knows nothing about HTTP; `auth_api.py` maps AuthError to responses.
"""
import base64, hashlib, hmac, re, secrets
import psycopg
import database as db

SESSION_HOURS = 12
RESET_MINUTES = 30
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15
MAX_RESET_ATTEMPTS = 5
ROLES = ('customer', 'admin')
SCRYPT = {'n': 2**14, 'r': 8, 'p': 1}
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O/1/I
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
USER_COLUMNS = 'id,email,display_name,role,is_active,created_at,last_login_at'


class AuthError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


# ---- primitives ---------------------------------------------------------------------
def hash_secret(value):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(value.encode(), salt=salt, dklen=32, maxmem=64 * 2**20, **SCRYPT)
    return 'scrypt${n}${r}${p}$'.format(**SCRYPT) + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


def verify_secret(value, stored):
    try:
        _, n, r, p, salt, digest = stored.split('$')
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(value.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                                dklen=len(expected), maxmem=64 * 2**20)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_secret('timing-equaliser')  # compared when the email is unknown


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(email):
    email = str(email or '').strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise AuthError('Email không hợp lệ.')
    return email


def check_password(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 128 or not password.strip():
        raise AuthError('Mật khẩu cần từ 8 đến 128 ký tự.')
    return password


def check_name(name):
    name = str(name or '').strip()
    if not 1 <= len(name) <= 100:
        raise AuthError('Tên hiển thị cần từ 1 đến 100 ký tự.')
    return name


def log_event(c, event, user_id=None, email=None, detail=None):
    c.execute('INSERT INTO mobilegis.auth_events(user_id,email,event,detail) VALUES(%s,%s,%s,%s)',
              (user_id, email, event, detail))


# ---- registration and sessions ------------------------------------------------------
def register(email, display_name, password):
    email, name, password = normalize_email(email), check_name(display_name), check_password(password)
    try:
        with db.connect() as c:
            user = c.execute(f'INSERT INTO mobilegis.app_users(email,display_name,password_hash) VALUES(%s,%s,%s) '
                             f'RETURNING {USER_COLUMNS}', (email, name, hash_secret(password))).fetchone()
            log_event(c, 'register', user['id'], email)
            return user
    except psycopg.errors.UniqueViolation:
        raise AuthError('Email này đã được đăng ký.', 409)


def create_session(c, user_id):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    c.execute("INSERT INTO mobilegis.app_sessions(token_hash,user_id,csrf_token,expires_at) "
              "VALUES(%s,%s,%s,now()+make_interval(hours=>%s))", (token_hash(token), user_id, csrf, SESSION_HOURS))
    return token, csrf


def login(email, password):
    """Return (user, session_token, csrf). Failures are deliberately generic."""
    invalid = AuthError('Email hoặc mật khẩu không đúng.', 401)
    try:
        email = normalize_email(email)
    except AuthError:
        raise invalid
    with db.connect() as c:
        row = c.execute('SELECT *,(locked_until>now()) AS locked FROM mobilegis.app_users WHERE email=%s', (email,)).fetchone()
        if not row:
            verify_secret(str(password), _DUMMY_HASH)
            log_event(c, 'login_failed', None, email, 'unknown email')
            c.commit()
            raise invalid
        if row['locked']:
            raise AuthError('Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ít phút.', 429)
        if not verify_secret(str(password), row['password_hash']):
            c.execute("UPDATE mobilegis.app_users SET "
                      "locked_until=CASE WHEN failed_logins+1>=%(max)s THEN now()+make_interval(mins=>%(lock)s) ELSE locked_until END, "
                      "failed_logins=CASE WHEN failed_logins+1>=%(max)s THEN 0 ELSE failed_logins+1 END WHERE id=%(id)s",
                      {'max': MAX_FAILED_LOGINS, 'lock': LOCK_MINUTES, 'id': row['id']})
            log_event(c, 'login_failed', row['id'], email)
            c.commit()
            raise invalid
        if not row['is_active']:
            raise AuthError('Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị viên.', 403)
        c.execute('UPDATE mobilegis.app_users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=%s', (row['id'],))
        token, csrf = create_session(c, row['id'])
        log_event(c, 'login', row['id'], email)
        user = c.execute(f'SELECT {USER_COLUMNS} FROM mobilegis.app_users WHERE id=%s', (row['id'],)).fetchone()
        return user, token, csrf


def session_user(token):
    """Return the user dict (with `csrf`) for a live session, else None."""
    if not token:
        return None
    with db.connect() as c:
        c.execute('DELETE FROM mobilegis.app_sessions WHERE expires_at<now()')
        return c.execute('SELECT u.id,u.email,u.display_name,u.role,u.is_active,u.created_at,u.last_login_at,s.csrf_token AS csrf '
                         'FROM mobilegis.app_sessions s JOIN mobilegis.app_users u ON u.id=s.user_id '
                         'WHERE s.token_hash=%s AND s.expires_at>now() AND u.is_active', (token_hash(token),)).fetchone()


def logout(token):
    with db.connect() as c:
        c.execute('DELETE FROM mobilegis.app_sessions WHERE token_hash=%s', (token_hash(token),))


def change_password(user_id, current, new, keep_token=None):
    new = check_password(new)
    with db.connect() as c:
        row = c.execute('SELECT email,password_hash FROM mobilegis.app_users WHERE id=%s', (user_id,)).fetchone()
        if not row or not verify_secret(str(current), row['password_hash']):
            raise AuthError('Mật khẩu hiện tại không đúng.', 403)
        c.execute('UPDATE mobilegis.app_users SET password_hash=%s WHERE id=%s', (hash_secret(new), user_id))
        c.execute('DELETE FROM mobilegis.app_sessions WHERE user_id=%s AND token_hash<>%s', (user_id, token_hash(keep_token or '')))
        log_event(c, 'password_changed', user_id, row['email'])


# ---- password reset (admin issues the code) -----------------------------------------
def request_reset(email):
    """Always succeeds from the caller's view so the form cannot be used to probe accounts."""
    try:
        email = normalize_email(email)
    except AuthError:
        return
    with db.connect() as c:
        user = c.execute('SELECT id FROM mobilegis.app_users WHERE email=%s AND is_active', (email,)).fetchone()
        if not user:
            return
        open_request = c.execute("SELECT 1 FROM mobilegis.password_resets WHERE user_id=%s AND status='pending'", (user['id'],)).fetchone()
        if not open_request:
            c.execute('INSERT INTO mobilegis.password_resets(user_id) VALUES(%s)', (user['id'],))
            log_event(c, 'reset_requested', user['id'], email)


def complete_reset(email, code, new_password):
    new_password, bad = check_password(new_password), AuthError('Mã không đúng hoặc đã hết hạn.', 400)
    try:
        email = normalize_email(email)
    except AuthError:
        raise bad
    code = str(code or '').strip().upper()
    with db.connect() as c:
        row = c.execute("SELECT r.id,r.code_hash,r.attempts,u.id AS user_id FROM mobilegis.password_resets r "
                        "JOIN mobilegis.app_users u ON u.id=r.user_id WHERE u.email=%s AND u.is_active AND r.status='issued' "
                        "AND r.expires_at>now() ORDER BY r.id DESC LIMIT 1 FOR UPDATE OF r", (email,)).fetchone()
        if not row or row['attempts'] >= MAX_RESET_ATTEMPTS:
            raise bad
        if not verify_secret(code, row['code_hash']):
            c.execute('UPDATE mobilegis.password_resets SET attempts=attempts+1 WHERE id=%s', (row['id'],))
            c.commit()
            raise bad
        c.execute('UPDATE mobilegis.app_users SET password_hash=%s,failed_logins=0,locked_until=NULL WHERE id=%s',
                  (hash_secret(new_password), row['user_id']))
        c.execute("UPDATE mobilegis.password_resets SET status='used',code_hash=NULL WHERE id=%s", (row['id'],))
        c.execute('DELETE FROM mobilegis.app_sessions WHERE user_id=%s', (row['user_id'],))
        log_event(c, 'password_reset', row['user_id'], email)


# ---- administration -----------------------------------------------------------------
def list_users():
    with db.connect() as c:
        return c.execute(f'SELECT {USER_COLUMNS} FROM mobilegis.app_users ORDER BY id').fetchall()


def _active_admins(c):
    return c.execute("SELECT count(*) AS n FROM mobilegis.app_users WHERE role='admin' AND is_active").fetchone()['n']


def _guard_last_admin(c, user_id):
    target = c.execute('SELECT role,is_active FROM mobilegis.app_users WHERE id=%s FOR UPDATE', (user_id,)).fetchone()
    if not target:
        raise AuthError('Không tìm thấy tài khoản.', 404)
    if target['role'] == 'admin' and target['is_active'] and _active_admins(c) <= 1:
        raise AuthError('Phải còn ít nhất một quản trị viên đang hoạt động.', 409)


def set_role(admin_id, user_id, role):
    if role not in ROLES:
        raise AuthError('Vai trò không hợp lệ.')
    with db.connect() as c:
        if role != 'admin':
            _guard_last_admin(c, user_id)
        if not c.execute('UPDATE mobilegis.app_users SET role=%s WHERE id=%s RETURNING id', (role, user_id)).fetchone():
            raise AuthError('Không tìm thấy tài khoản.', 404)
        log_event(c, 'role_changed', user_id, None, f'{role} by {admin_id}')


def set_active(admin_id, user_id, active):
    with db.connect() as c:
        if not active:
            _guard_last_admin(c, user_id)
        if not c.execute('UPDATE mobilegis.app_users SET is_active=%s WHERE id=%s RETURNING id', (bool(active), user_id)).fetchone():
            raise AuthError('Không tìm thấy tài khoản.', 404)
        if not active:
            c.execute('DELETE FROM mobilegis.app_sessions WHERE user_id=%s', (user_id,))
        log_event(c, 'activated' if active else 'deactivated', user_id, None, f'by {admin_id}')


def delete_user(admin_id, user_id):
    with db.connect() as c:
        _guard_last_admin(c, user_id)
        c.execute('DELETE FROM mobilegis.app_users WHERE id=%s', (user_id,))
        log_event(c, 'user_deleted', None, None, f'{user_id} by {admin_id}')


def list_resets():
    with db.connect() as c:
        return c.execute("SELECT r.id,r.status,r.requested_at,r.issued_at,r.expires_at,u.email,u.display_name "
                         "FROM mobilegis.password_resets r JOIN mobilegis.app_users u ON u.id=r.user_id "
                         "WHERE r.status IN ('pending','issued') ORDER BY r.requested_at DESC").fetchall()


def issue_reset(admin_id, reset_id):
    """Create a one-time code, shown to the admin once; only its hash is kept."""
    code = ''.join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    with db.connect() as c:
        row = c.execute("UPDATE mobilegis.password_resets SET status='issued',code_hash=%s,attempts=0,issued_by=%s,issued_at=now(),"
                        "expires_at=now()+make_interval(mins=>%s) WHERE id=%s AND status IN ('pending','issued') "
                        "RETURNING user_id", (hash_secret(code), admin_id, RESET_MINUTES, reset_id)).fetchone()
        if not row:
            raise AuthError('Yêu cầu không tồn tại hoặc đã xử lý.', 404)
        log_event(c, 'reset_issued', row['user_id'], None, f'by {admin_id}')
    return code, RESET_MINUTES


def cancel_reset(admin_id, reset_id):
    with db.connect() as c:
        if not c.execute("UPDATE mobilegis.password_resets SET status='cancelled',code_hash=NULL WHERE id=%s "
                         "AND status IN ('pending','issued') RETURNING id", (reset_id,)).fetchone():
            raise AuthError('Yêu cầu không tồn tại hoặc đã xử lý.', 404)
        log_event(c, 'reset_cancelled', None, None, f'{reset_id} by {admin_id}')


def events(limit=100):
    with db.connect() as c:
        return c.execute('SELECT e.id,e.created_at,e.event,e.detail,COALESCE(e.email,u.email) AS email '
                         'FROM mobilegis.auth_events e LEFT JOIN mobilegis.app_users u ON u.id=e.user_id '
                         'ORDER BY e.id DESC LIMIT %s', (limit,)).fetchall()
