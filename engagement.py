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


# ---- editorial content: area notes and highlights ------------------------------------
MAX_HIGHLIGHTS = 6
PAGES = ('trang-chu', 'ban-do', 'bang-so-lieu', 'thong-ke', 'gia-lap', 'du-lieu')
LAYERS = ('lst', 'ndvi', 'tvdi')


def get_content():
    with db.connect() as c:
        notes = {r['code']: r['note'] for r in c.execute('SELECT code,note FROM mobilegis.area_notes').fetchall()}
        highlights = c.execute('SELECT id,title,body,code FROM mobilegis.highlights ORDER BY created_at DESC LIMIT %s', (MAX_HIGHLIGHTS,)).fetchall()
    return {'notes': notes, 'highlights': highlights}


def set_note(admin_id, code, text):
    code, text = _code(code), str(text or '').strip()
    if len(text) > 500:
        raise AuthError('Ghi chú tối đa 500 ký tự.')
    with db.connect() as c:
        if not text:
            c.execute('DELETE FROM mobilegis.area_notes WHERE code=%s', (code,))
        else:
            c.execute('INSERT INTO mobilegis.area_notes(code,note,updated_by) VALUES(%s,%s,%s) ON CONFLICT(code) DO UPDATE SET note=EXCLUDED.note,updated_at=now(),updated_by=EXCLUDED.updated_by', (code, text, admin_id))


def add_highlight(admin_id, title, body, code):
    title, body, code = str(title or '').strip(), str(body or '').strip(), _code(code, required=False)
    if not 1 <= len(title) <= 120 or not 1 <= len(body) <= 400:
        raise AuthError('Tiêu đề tối đa 120 ký tự và nội dung tối đa 400 ký tự, không để trống.')
    with db.connect() as c:
        if c.execute('SELECT count(*) AS n FROM mobilegis.highlights').fetchone()['n'] >= MAX_HIGHLIGHTS:
            raise AuthError(f'Chỉ giữ tối đa {MAX_HIGHLIGHTS} điểm nhấn. Xóa bớt trước khi thêm.', 409)
        return c.execute('INSERT INTO mobilegis.highlights(title,body,code,created_by) VALUES(%s,%s,%s,%s) RETURNING id', (title, body, code, admin_id)).fetchone()['id']


def delete_highlight(highlight_id):
    with db.connect() as c:
        if not c.execute('DELETE FROM mobilegis.highlights WHERE id=%s RETURNING id', (highlight_id,)).fetchone():
            raise AuthError('Không tìm thấy điểm nhấn.', 404)


# ---- anonymous usage counters --------------------------------------------------------
def record_hit(kind, key):
    ok = (kind == 'area' and isinstance(key, str) and CODE_RE.match(key)) or (kind == 'layer' and key in LAYERS) or (kind == 'page' and key in PAGES)
    if not ok:
        raise AuthError('Không hợp lệ.')
    with db.connect() as c:
        c.execute('INSERT INTO mobilegis.usage_counts(kind,key,n) VALUES(%s,%s,1) ON CONFLICT(day,kind,key) DO UPDATE SET n=mobilegis.usage_counts.n+1', (kind, key))


def usage(days=30):
    with db.connect() as c:
        rows = c.execute("SELECT kind,key,sum(n)::int AS n FROM mobilegis.usage_counts WHERE day > current_date - %s GROUP BY kind,key ORDER BY n DESC", (days,)).fetchall()
        per_day = c.execute("SELECT day,sum(n)::int AS n FROM mobilegis.usage_counts WHERE kind='page' AND day > current_date - %s GROUP BY day ORDER BY day", (days,)).fetchall()
    pick = lambda kind, limit=10: [r for r in rows if r['kind'] == kind][:limit]
    return {'days': days, 'areas': pick('area'), 'layers': pick('layer'), 'pages': pick('page'), 'per_day': per_day}


# ---- field tests: speed runs and the usability survey (anonymous) ---------------------------------------
import statistics
TASKS = ('T1', 'T2', 'T3', 'T4', 'T5')
RATINGS = ('easy', 'legend', 'trust', 'useful')
CONNECTIONS = ('wifi', 'mobile', 'other')


def _text(value, limit, required=False, label='Nội dung'):
    value = str(value or '').strip()
    if required and not value:
        raise AuthError(f'{label} không được để trống.')
    if len(value) > limit:
        raise AuthError(f'{label} tối đa {limit} ký tự.')
    return value or None


def _ms(value, label):
    if value in (None, ''):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 120000:
        raise AuthError(f'{label} không hợp lệ.')
    return int(round(value))


def add_perf(data):
    device = _text(data.get('device'), 120, True, 'Tên thiết bị')
    connection = data.get('connection')
    if connection not in CONNECTIONS:
        raise AuthError('Chọn loại mạng: Wi-Fi hoặc mạng di động.')
    layers = data.get('layer_ms') or []
    if not isinstance(layers, list) or len(layers) > 12:
        raise AuthError('Danh sách thời gian đổi lớp không hợp lệ.')
    layers = [_ms(v, 'Thời gian đổi lớp') for v in layers]
    if any(v is None for v in layers):
        raise AuthError('Thời gian đổi lớp không hợp lệ.')
    first = _ms(data.get('first_map_ms'), 'Thời gian mở bản đồ')
    if first is None and not layers:
        raise AuthError('Chưa có số đo nào để gửi.')
    median = int(round(statistics.median(layers))) if layers else None
    with db.connect() as c:
        return c.execute('INSERT INTO mobilegis.perf_runs(device,screen,connection,net_info,first_map_ms,first_open,layer_ms,layer_median_ms,note) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                         (device, _text(data.get('screen'), 60), connection, _text(data.get('net_info'), 60), first, bool(data.get('first_open')), layers, median, _text(data.get('note'), 200))).fetchone()['id']


def add_survey(data):
    tasks, ratings = data.get('tasks'), data.get('ratings')
    if not isinstance(tasks, dict) or set(tasks) != set(TASKS):
        raise AuthError('Cần trả lời đủ 5 nhiệm vụ.')
    clean_tasks = {}
    for key in TASKS:
        t = tasks[key]
        if not isinstance(t, dict) or not isinstance(t.get('done'), bool):
            raise AuthError(f'Nhiệm vụ {key}: chọn Làm được hoặc Chưa làm được.')
        taps = t.get('taps', 0)
        if isinstance(taps, bool) or not isinstance(taps, int) or not 0 <= taps <= 9:
            raise AuthError(f'Nhiệm vụ {key}: số lần chạm sai từ 0 đến 9.')
        clean_tasks[key] = {'done': t['done'], 'taps': taps}
    if not isinstance(ratings, dict) or set(ratings) != set(RATINGS):
        raise AuthError('Cần chấm đủ 4 câu.')
    for key in RATINGS:
        v = ratings[key]
        if isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 5:
            raise AuthError('Điểm chấm từ 1 đến 5.')
    from psycopg.types.json import Jsonb
    with db.connect() as c:
        return c.execute('INSERT INTO mobilegis.survey_responses(participant,device,tasks,ratings,comment) VALUES(%s,%s,%s,%s,%s) RETURNING id',
                         (_text(data.get('participant'), 40), _text(data.get('device'), 120), Jsonb(clean_tasks), Jsonb({k: ratings[k] for k in RATINGS}), _text(data.get('comment'), 500))).fetchone()['id']


def field_summary():
    with db.connect() as c:
        perf = c.execute('SELECT id,created_at,device,screen,connection,net_info,first_map_ms,first_open,layer_ms,layer_median_ms,note FROM mobilegis.perf_runs ORDER BY id DESC LIMIT 500').fetchall()
        survey = c.execute('SELECT id,created_at,participant,device,tasks,ratings,comment FROM mobilegis.survey_responses ORDER BY id DESC LIMIT 500').fetchall()
    med = lambda values: int(round(statistics.median(values))) if values else None
    by_conn = {}
    for conn in CONNECTIONS:
        rows = [r for r in perf if r['connection'] == conn]
        by_conn[conn] = {'runs': len(rows), 'first_map_ms': med([r['first_map_ms'] for r in rows if r['first_map_ms'] is not None]), 'layer_median_ms': med([r['layer_median_ms'] for r in rows if r['layer_median_ms'] is not None])}
    n = len(survey)
    tasks = {k: {'done': sum(1 for r in survey if r['tasks'][k]['done']), 'taps': round(sum(r['tasks'][k]['taps'] for r in survey) / n, 2) if n else None} for k in TASKS}
    ratings = {k: round(sum(r['ratings'][k] for r in survey) / n, 2) if n else None for k in RATINGS}
    return {'perf': perf, 'survey': survey, 'perf_by_connection': by_conn, 'survey_n': n, 'survey_tasks': tasks, 'survey_ratings': ratings,
            'devices': len({r['device'] for r in perf})}
