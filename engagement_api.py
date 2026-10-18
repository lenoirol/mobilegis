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
