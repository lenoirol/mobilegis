"""REST routes: saved areas (signed-in users), feedback (signed-in users send, admins triage) and the public site notice (admins edit)."""
from fastapi import APIRouter, Depends, Request
import auth, engagement
from auth_api import _call, require_admin, require_admin_write, require_csrf, require_user
from http_utils import read_json

router = APIRouter()


@router.get('/api/notice')
async def notice():
    return {'text': await _call(engagement.get_notice)}


@router.post('/api/admin/notice')
async def set_notice(request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 2000)
    await _call(engagement.set_notice, admin['id'], data.get('text'))
    return {'ok': True}


@router.get('/api/me/favorites')
async def favorites(user=Depends(require_user)):
    return await _call(engagement.list_favorites, user['id'])


@router.post('/api/me/favorites')
async def add_favorite(request: Request, user=Depends(require_csrf)):
    data = await read_json(request, 1000)
    await _call(engagement.add_favorite, user['id'], data.get('code'))
    return {'ok': True}


@router.delete('/api/me/favorites/{code}')
async def remove_favorite(code: str, user=Depends(require_csrf)):
    await _call(engagement.remove_favorite, user['id'], code)
    return {'ok': True}


@router.post('/api/feedback')
async def send_feedback(request: Request, user=Depends(require_csrf)):
    data = await read_json(request, 4000)
    return {'ok': True, 'id': await _call(engagement.add_feedback, user['id'], data.get('kind'), data.get('code'), data.get('message'))}


@router.get('/api/admin/feedback')
async def feedback_list(admin=Depends(require_admin)):
    return await _call(engagement.list_feedback)


@router.post('/api/admin/feedback/{feedback_id}/status')
async def feedback_status(feedback_id: int, request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 1000)
    await _call(engagement.set_feedback_status, admin['id'], feedback_id, data.get('status'))
    return {'ok': True}


@router.post('/api/admin/users')
async def create_user(request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 2000)
    user = await _call(auth.create_user, admin['id'], data.get('email'), data.get('display_name'), data.get('password'), data.get('role', 'customer'))
    return {'id': user['id'], 'email': user['email']}


# ---- editorial content and usage -----------------------------------------------------
import time
from collections import defaultdict, deque
from fastapi import HTTPException

_hits = defaultdict(deque)   # per-client sliding window; in memory, never stored


@router.get('/api/content')
async def content():
    return await _call(engagement.get_content)


@router.post('/api/admin/notes')
async def set_note(request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 3000)
    await _call(engagement.set_note, admin['id'], data.get('code'), data.get('text'))
    return {'ok': True}


@router.post('/api/admin/highlights')
async def add_highlight(request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 3000)
    return {'id': await _call(engagement.add_highlight, admin['id'], data.get('title'), data.get('body'), data.get('code') or None)}


@router.delete('/api/admin/highlights/{highlight_id}')
async def delete_highlight(highlight_id: int, admin=Depends(require_admin_write)):
    await _call(engagement.delete_highlight, highlight_id)
    return {'ok': True}


@router.post('/api/hit')
async def hit(request: Request):
    client = request.headers.get('x-forwarded-for', '').split(',')[0].strip() or (request.client.host if request.client else '?')   # behind Render's proxy the peer is the proxy
    window, now = _hits[client], time.monotonic()
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= 120:
        raise HTTPException(429, 'Quá nhiều yêu cầu.')
    window.append(now)
    if len(_hits) > 5000:   # keep the table from growing without bound
        for key in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
            _hits.pop(key, None)
    data = await read_json(request, 500)
    await _call(engagement.record_hit, data.get('kind'), data.get('key'))
    return {'ok': True}


@router.get('/api/admin/usage')
async def usage(admin=Depends(require_admin)):
    return await _call(engagement.usage)


# ---- field tests (public, anonymous, rate-limited per client) ------------------------------------------
import csv, io, json
from fastapi.responses import Response

_field = defaultdict(deque)


def _limit_field(request: Request, kind: str):
    """A class often shares one Wi-Fi address, so the cap is generous: 60 sends an hour per client and kind."""
    client = request.headers.get('x-forwarded-for', '').split(',')[0].strip() or (request.client.host if request.client else '?')
    window, now = _field[(client, kind)], time.monotonic()
    while window and now - window[0] > 3600:
        window.popleft()
    if len(window) >= 60:
        raise HTTPException(429, 'Gửi hơi nhiều trong một giờ. Vui lòng thử lại sau.')
    window.append(now)
    if len(_field) > 5000:
        for key in [k for k, v in _field.items() if not v or now - v[-1] > 3600]:
            _field.pop(key, None)


@router.post('/api/field/perf')
async def field_perf(request: Request):
    _limit_field(request, 'perf')
    data = await read_json(request, 4000)
    return {'ok': True, 'id': await _call(engagement.add_perf, data)}


@router.post('/api/field/survey')
async def field_survey(request: Request):
    _limit_field(request, 'survey')
    data = await read_json(request, 6000)
    return {'ok': True, 'id': await _call(engagement.add_survey, data)}


@router.get('/api/admin/field')
async def field_summary(admin=Depends(require_admin)):
    return await _call(engagement.field_summary)


@router.get('/api/admin/field.csv')
async def field_csv(kind: str, admin=Depends(require_admin)):
    if kind not in ('perf', 'survey'):
        raise HTTPException(400, 'kind phải là perf hoặc survey.')
    data = await _call(engagement.field_summary)
    out = io.StringIO()
    out.write('\ufeff')
    w = csv.writer(out)
    if kind == 'perf':
        w.writerow(['id', 'thoi_gian', 'thiet_bi', 'man_hinh', 'mang', 'thong_tin_mang', 'mo_ban_do_ms', 'mo_lan_dau', 'doi_lop_ms', 'doi_lop_trung_vi_ms', 'ghi_chu'])
        for r in data['perf']:
            w.writerow([r['id'], r['created_at'].isoformat(timespec='seconds'), r['device'], r['screen'], r['connection'], r['net_info'], r['first_map_ms'], r['first_open'], ' '.join(map(str, r['layer_ms'])), r['layer_median_ms'], r['note']])
    else:
        w.writerow(['id', 'thoi_gian', 'nguoi_lam', 'thiet_bi'] + [f'{t}_lam_duoc' for t in engagement.TASKS] + [f'{t}_cham_sai' for t in engagement.TASKS] + list(engagement.RATINGS) + ['gop_y'])
        for r in data['survey']:
            w.writerow([r['id'], r['created_at'].isoformat(timespec='seconds'), r['participant'], r['device']] + [int(r['tasks'][t]['done']) for t in engagement.TASKS] + [r['tasks'][t]['taps'] for t in engagement.TASKS] + [r['ratings'][k] for k in engagement.RATINGS] + [r['comment']])
    return Response(out.getvalue(), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="mobilegis_{kind}.csv"'})
