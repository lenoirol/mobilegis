"""Saved areas, visitor feedback and the site notice. Blocking database code; `engagement_api.py` maps it to HTTP."""
import re
import database as db
from auth import AuthError

MAX_FAVORITES = 30
MAX_FEEDBACK_PER_HOUR = 5
KINDS = ('data_error', 'suggestion', 'ui_error')
CODE_RE = re.compile(r'^[0-9]{5}$')
NOTICE_MAX = 300


def _code(value, required=True):
    if value in (None, '') and not required:
        return None
    if not isinstance(value, str) or not CODE_RE.match(value):
        raise AuthError('Mã xã/phường không hợp lệ.')
    return value


# ---- saved areas ---------------------------------------------------------------------
def list_favorites(user_id):
    with db.connect() as c:
        return [r['code'] for r in c.execute('SELECT code FROM mobilegis.user_favorites WHERE user_id=%s ORDER BY created_at', (user_id,)).fetchall()]


def add_favorite(user_id, code):
    code = _code(code)
    with db.connect() as c:
        if c.execute('SELECT count(*) AS n FROM mobilegis.user_favorites WHERE user_id=%s', (user_id,)).fetchone()['n'] >= MAX_FAVORITES:
            raise AuthError(f'Chỉ lưu tối đa {MAX_FAVORITES} khu vực.', 409)
        if not c.execute('SELECT 1 FROM mobilegis.admin_units WHERE code=%s LIMIT 1', (code,)).fetchone():
            raise AuthError('Không có khu vực này.', 404)
        c.execute('INSERT INTO mobilegis.user_favorites(user_id,code) VALUES(%s,%s) ON CONFLICT DO NOTHING', (user_id, code))


def remove_favorite(user_id, code):
    with db.connect() as c:
        c.execute('DELETE FROM mobilegis.user_favorites WHERE user_id=%s AND code=%s', (user_id, _code(code)))


# ---- feedback ------------------------------------------------------------------------
def add_feedback(user_id, kind, code, message):
    if kind not in KINDS:
        raise AuthError('Loại góp ý không hợp lệ.')
    message = str(message or '').strip()
    if not 5 <= len(message) <= 1000:
        raise AuthError('Nội dung góp ý cần từ 5 đến 1000 ký tự.')
    code = _code(code, required=False)
    with db.connect() as c:
        recent = c.execute("SELECT count(*) AS n FROM mobilegis.feedback WHERE user_id=%s AND created_at > now() - interval '1 hour'", (user_id,)).fetchone()['n']
        if recent >= MAX_FEEDBACK_PER_HOUR:
            raise AuthError('Bạn gửi hơi nhiều trong một giờ. Vui lòng thử lại sau.', 429)
        return c.execute('INSERT INTO mobilegis.feedback(user_id,code,kind,message) VALUES(%s,%s,%s,%s) RETURNING id', (user_id, code, kind, message)).fetchone()['id']


def list_feedback(limit=200):
    with db.connect() as c:
        return c.execute('SELECT f.id,f.code,f.kind,f.message,f.status,f.created_at,f.handled_at,u.display_name,u.email FROM mobilegis.feedback f '
                         'LEFT JOIN mobilegis.app_users u ON u.id=f.user_id ORDER BY (f.status=\'new\') DESC, f.created_at DESC LIMIT %s', (limit,)).fetchall()


def set_feedback_status(admin_id, feedback_id, status):
    if status not in ('new', 'done'):
        raise AuthError('Trạng thái không hợp lệ.')
    with db.connect() as c:
        done = status == 'done'
        if not c.execute('UPDATE mobilegis.feedback SET status=%s,handled_at=CASE WHEN %s THEN now() END,handled_by=CASE WHEN %s THEN %s END WHERE id=%s RETURNING id',
                         (status, done, done, admin_id, feedback_id)).fetchone():
            raise AuthError('Không tìm thấy góp ý.', 404)


# ---- site notice ---------------------------------------------------------------------
def get_notice():
    with db.connect() as c:
        row = c.execute("SELECT value FROM mobilegis.site_settings WHERE key='notice'").fetchone()
    return row['value'] if row else ''


def set_notice(admin_id, text):
    text = str(text or '').strip()
    if len(text) > NOTICE_MAX:
        raise AuthError(f'Thông báo tối đa {NOTICE_MAX} ký tự.')
    with db.connect() as c:
        if not text:
            c.execute("DELETE FROM mobilegis.site_settings WHERE key='notice'")
        else:
            c.execute("INSERT INTO mobilegis.site_settings(key,value,updated_by) VALUES('notice',%s,%s) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by", (text, admin_id))
