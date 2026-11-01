"""Admin data import: per-commune observations (CSV) that add or correct values of the published research source.

Design rules (honesty first):
- The published rows and rasters are never edited. An import is an OVERLAY stored in `mobilegis.observation_imports`;
  the API serves published rows with applied imports merged on top, and an admin can revert any import.
- Every value is validated (ranges, pixel counts, known commune codes, years 2020–2025). Nothing is filled or guessed:
  a blank value with blank pixel count leaves that index untouched; pixels = 0 with a blank value marks it as "no valid data".
- Coverage is always pixels / sampled_pixels. The ≥ 50 % rule of the viewer policy keeps applying to imported rows.
The pure functions (parse, validate, merge) do not touch the database so they can be tested without one.
"""
import csv, hashlib, io, re
from psycopg.types.json import Jsonb
import database as db
from auth import AuthError, log_event

DATASET = 'gee_recovery'
INDICES = ('lst', 'ndvi', 'tvdi')
RANGE = {'lst': (-10.0, 70.0), 'ndvi': (-1.0, 1.0), 'tvdi': (0.0, 1.0)}
YEARS = range(2020, 2026)
MAX_ROWS, MAX_BYTES = 2000, 1_000_000
COLUMNS = ['code', 'year', 'sampled_pixels'] + [f'{k}{s}' for k in INDICES for s in ('', '_pixels')] + ['dates']
CODE = re.compile(r'^[0-9]{5}$')
DATE = re.compile(r'^20[0-9]{2}-[01][0-9]-[0-3][0-9]$')


def template_csv(rows=None):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for r in rows or []:
        writer.writerow([r.get(c, '') for c in COLUMNS])
    return '﻿' + out.getvalue()


def _num(text, label, errors, line, lo=None, hi=None, integer=False):
    text = (text or '').strip().replace(',', '.')
    if text == '':
        return None
    try:
        value = int(text) if integer else float(text)
    except ValueError:
        errors.append(f'Dòng {line}: {label} không phải số ("{text[:20]}").')
        return None
    if value != value or value in (float('inf'), float('-inf')):
        errors.append(f'Dòng {line}: {label} không hợp lệ.')
        return None
    if (lo is not None and value < lo) or (hi is not None and value > hi):
        errors.append(f'Dòng {line}: {label} = {value} nằm ngoài khoảng {lo}–{hi}.')
        return None
    return value


def parse(text, codes):
    """Return (rows, errors). `codes` = set of the 167 valid commune codes. rows: dicts with only the fields the file gave."""
    if len(text.encode('utf8')) > MAX_BYTES:
        raise AuthError('Tệp quá lớn (tối đa 1 MB).')
    reader = csv.DictReader(io.StringIO(text.lstrip('﻿')))
    header = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in ('code', 'year', 'sampled_pixels') if c not in header]
    if missing:
        raise AuthError('Thiếu cột bắt buộc: ' + ', '.join(missing) + '. Tải tệp mẫu để xem đúng định dạng.')
    unknown = [h for h in header if h not in COLUMNS]
    if unknown:
        raise AuthError('Cột không nhận ra: ' + ', '.join(unknown) + '.')
    rows, errors, seen = [], [], set()
    for line, raw in enumerate(reader, start=2):
        if len(rows) + len(errors) > MAX_ROWS:
            raise AuthError(f'Tối đa {MAX_ROWS} dòng mỗi lần nhập.')
        r = {(k or '').strip().lower(): (v or '') for k, v in raw.items()}
        if not any(r.values()):
            continue
        before = len(errors)
        code = r.get('code', '').strip().zfill(5)
        if not CODE.match(code) or code not in codes:
            errors.append(f'Dòng {line}: mã khu vực "{r.get("code", "")[:12]}" không thuộc 167 xã/phường.')
        year = _num(r.get('year'), 'năm', errors, line, integer=True)
        if year is not None and year not in YEARS:
            errors.append(f'Dòng {line}: năm {year} ngoài 2020–2025.')
        sampled = _num(r.get('sampled_pixels'), 'sampled_pixels', errors, line, 1, 1_000_000, integer=True)
        if sampled is None and not any('sampled_pixels' in e and f'Dòng {line}' in e for e in errors):
            errors.append(f'Dòng {line}: thiếu sampled_pixels (tổng số ô lấy mẫu của khu vực).')
        if (code, year) in seen:
            errors.append(f'Dòng {line}: trùng khu vực {code} năm {year} trong cùng tệp.')
        seen.add((code, year))
        row = {'code': code, 'year': year, 'sampled_pixels': sampled}
        for k in INDICES:
            value = _num(r.get(k), k.upper(), errors, line, *RANGE[k])
            pixels = _num(r.get(f'{k}_pixels'), f'{k}_pixels', errors, line, 0, 1_000_000, integer=True)
            if pixels is not None and sampled is not None and pixels > sampled:
                errors.append(f'Dòng {line}: {k}_pixels ({pixels}) lớn hơn sampled_pixels ({sampled}).')
            if value is not None and not pixels:
                errors.append(f'Dòng {line}: {k.upper()} có giá trị nhưng {k}_pixels trống hoặc 0.')
            if value is None and pixels:
                errors.append(f'Dòng {line}: {k}_pixels = {pixels} nhưng thiếu giá trị {k.upper()}.')
            if value is not None or pixels is not None:
                row[k], row[k + '_pixels'] = value, pixels or 0
        dates = [d.strip() for d in re.split(r'[;| ]+', r.get('dates', '')) if d.strip()]
        for d in dates:
            if not DATE.match(d):
                errors.append(f'Dòng {line}: ngày "{d[:12]}" phải dạng YYYY-MM-DD.')
        if dates:
            row['dates'] = dates
        if len(errors) == before:
            rows.append(row)
    if not rows and not errors:
        errors.append('Tệp không có dòng dữ liệu nào.')
    return rows, errors


def merge_row(base, change, import_id=None, names=None):
    """Return the row with the import applied (never mutates `base`). `base` may be None for a commune/year not in the source."""
    out = dict(base) if base else {'code': change['code'], 'year': change['year'], 'name': (names or {}).get(change['code'], change['code']),
                                  'dates': [], 'scene_ids': [], 'source': 'Quản trị viên nhập', 'resolution_m': 120, 'method': 'admin_import'}
    sampled = change.get('sampled_pixels') or out.get('sampled_pixels')
    out['sampled_pixels'] = sampled
    for k in INDICES:
        if k not in change:
            continue
        pixels = change[k + '_pixels']
        out[k] = change[k] if pixels else None
        out[k + '_pixels'] = pixels
        out[k + '_coverage'] = (pixels / sampled) if sampled else None
    if change.get('dates'):
        out['dates'] = sorted(set(out.get('dates') or []) | set(change['dates']))
    out['admin_import'] = import_id if import_id is not None else True
    if import_id is not None:
        base_source = str(out.get('source', '')).split(' · cập nhật bởi quản trị viên')[0]
        out['source'] = f'{base_source} · cập nhật bởi quản trị viên (nhập #{import_id})'
    return out


def apply_overlay(rows, imports, names=None):
    """Published rows + applied imports (in id order, later wins). Returns a new list; adds rows for new commune/year pairs."""
    if not imports:
        return rows
    index = {(r['code'], r['year']): i for i, r in enumerate(rows)}
    out = list(rows)
    for imp in imports:
        for change in imp['rows']:
            key = (change['code'], change['year'])
            if key in index:
                out[index[key]] = merge_row(out[index[key]], change, imp['id'], names)
            else:
                index[key] = len(out)
                out.append(merge_row(None, change, imp['id'], names))
    return sorted(out, key=lambda r: (r['year'], r['code'])) if len(out) != len(rows) else out


# ---------------------------------------------------------------- database layer
def valid_codes():
    return {f['properties']['code'] for f in db.boundaries()['features']}


def names_by_code():
    return {f['properties']['code']: f['properties'].get('full_name') or f['properties'].get('name') for f in db.boundaries()['features']}


def applied_imports():
    with db.connect() as c:
        return c.execute("SELECT id, rows FROM mobilegis.observation_imports WHERE status='applied' ORDER BY id").fetchall()


def overlay(rows, source=DATASET):
    if source != DATASET:
        return rows
    try:
        imports = applied_imports()
    except Exception:   # table missing before migration 008: serve the published rows unchanged
        return rows
    return apply_overlay(rows, imports, names_by_code())


def preview(text):
    rows, errors = parse(text, valid_codes())
    published = {(r['code'], r['year']): r for r in db.observations(DATASET)}
    names = names_by_code()
    current = {(r['code'], r['year']): r for r in overlay(list(published.values()))}
    changes = []
    for change in rows:
        key = (change['code'], change['year'])
        before, after = current.get(key), merge_row(current.get(key), change, None, names)
        diff = []
        for k in INDICES:
            if k in change:
                old, new = (before or {}).get(k), after.get(k)
                oldc, newc = (before or {}).get(k + '_coverage'), after.get(k + '_coverage')
                if old != new or oldc != newc:
                    diff.append({'index': k, 'before': old, 'before_coverage': oldc, 'after': new, 'after_coverage': newc})
        changes.append({'code': key[0], 'year': key[1], 'name': names.get(key[0]), 'new': before is None, 'diff': diff})
    return {'rows': len(rows), 'errors': errors[:50], 'error_count': len(errors), 'changes': changes[:300],
            'changed_rows': sum(1 for c in changes if c['diff']), 'new_rows': sum(1 for c in changes if c['new'])}


def create(admin_id, filename, text, note):
    rows, errors = parse(text, valid_codes())
    if errors:
        raise AuthError('Tệp còn lỗi, chưa nhập: ' + errors[0] + (f' (và {len(errors) - 1} lỗi nữa)' if len(errors) > 1 else ''))
    digest = hashlib.sha256(text.encode('utf8')).hexdigest()
    with db.connect() as c:
        row = c.execute('INSERT INTO mobilegis.observation_imports(created_by,filename,sha256,row_count,note,rows) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id',
                        (admin_id, (filename or 'nhap.csv')[:120], digest, len(rows), (note or '')[:300], Jsonb(rows))).fetchone()
        log_event(c, 'data_import', admin_id, None, f'import #{row["id"]}: {len(rows)} dòng')
    db.clear_cache()
    return row['id']


def listing():
    with db.connect() as c:
        return c.execute("SELECT i.id, i.created_at, i.filename, i.row_count, i.status, i.note, u.display_name AS by FROM mobilegis.observation_imports i LEFT JOIN mobilegis.app_users u ON u.id=i.created_by ORDER BY i.id DESC LIMIT 50").fetchall()


def set_status(admin_id, import_id, status):
    with db.connect() as c:
        if not c.execute('UPDATE mobilegis.observation_imports SET status=%s WHERE id=%s RETURNING id', (status, import_id)).fetchone():
            raise AuthError('Không tìm thấy lần nhập này.', 404)
        log_event(c, 'data_import_' + status, admin_id, None, f'import #{import_id}')
    db.clear_cache()
