"""REST routes for accounts plus the permission dependencies used by the rest of the API.

Roles: guests (not signed in) may read; `customer` and `admin` sign in; only `admin`
may change data (demo points, simulations) or manage accounts. Writes need the session
cookie AND the matching `X-Token` header (CSRF token, returned by /api/session).
"""
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
import auth
from http_utils import read_json

COOKIE = 'mg_session'
router = APIRouter()


def public_user(user):
    return {k: user[k] for k in ('id', 'email', 'display_name', 'role', 'is_active', 'created_at', 'last_login_at') if k in user}


def current_user(request: Request):
    return auth.session_user(request.cookies.get(COOKIE))


def require_user(user=Depends(current_user)):
    if not user:
        raise HTTPException(401, 'Cần đăng nhập.')
    return user


def require_csrf(request: Request, user=Depends(require_user)):
    if not secrets.compare_digest(request.headers.get('X-Token', ''), user['csrf']):
        raise HTTPException(403, 'Phiên không hợp lệ. Tải lại trang.')
    return user


def require_admin(user=Depends(require_user)):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Chỉ quản trị viên được thực hiện thao tác này.')
    return user


def require_admin_write(user=Depends(require_csrf)):
    return require_admin(user)


def _call(function, *args):
    """Run a blocking auth function off the event loop and map AuthError to HTTP errors."""
    async def run():
        try:
            return await run_in_threadpool(function, *args)
        except auth.AuthError as error:
            raise HTTPException(error.status, error.message)
    return run()


def _set_cookie(request, response, token):
    secure = request.url.scheme == 'https' or request.headers.get('x-forwarded-proto') == 'https'
    response.set_cookie(COOKIE, token, max_age=auth.SESSION_HOURS * 3600, httponly=True, samesite='lax', secure=secure, path='/')


@router.get('/api/session')
def session(user=Depends(current_user)):
    return {'token': user['csrf'] if user else '', 'user': public_user(user) if user else None}


@router.post('/api/auth/register')
async def register(request: Request, response: Response):
    data = await read_json(request, 4000)
    user = await _call(auth.register, data.get('email'), data.get('display_name'), data.get('password'))
    result = await _call(auth.login, data.get('email'), data.get('password'))
    _set_cookie(request, response, result[1])
    return {'user': public_user(result[0]), 'token': result[2], 'created': user['id']}


@router.post('/api/auth/login')
async def login(request: Request, response: Response):
    data = await read_json(request, 4000)
    user, token, csrf = await _call(auth.login, data.get('email'), data.get('password'))
    _set_cookie(request, response, token)
    return {'user': public_user(user), 'token': csrf}


@router.post('/api/auth/logout')
async def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        await _call(auth.logout, token)
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}


@router.get('/api/auth/me')
def me(user=Depends(require_user)):
    return {'user': public_user(user), 'token': user['csrf']}


@router.post('/api/auth/change-password')
async def change_password(request: Request, user=Depends(require_csrf)):
    data = await read_json(request, 4000)
    await _call(auth.change_password, user['id'], data.get('current_password'), data.get('new_password'), request.cookies.get(COOKIE))
    return {'ok': True}


@router.post('/api/auth/forgot')
async def forgot(request: Request):
    data = await read_json(request, 2000)
    await _call(auth.request_reset, data.get('email'))
    return {'ok': True, 'message': 'Nếu email tồn tại, yêu cầu đã gửi tới quản trị viên. Quản trị viên sẽ cấp mã đặt lại cho bạn.'}


@router.post('/api/auth/reset')
async def reset(request: Request):
    data = await read_json(request, 4000)
    await _call(auth.complete_reset, data.get('email'), data.get('code'), data.get('new_password'))
    return {'ok': True}


# ---- administration -----------------------------------------------------------------
def _target_id(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise HTTPException(400, 'Mã không hợp lệ.')
    return value


@router.get('/api/admin/users')
async def admin_users(user=Depends(require_admin)):
    return [public_user(u) for u in await _call(auth.list_users)]


@router.post('/api/admin/users/{user_id}/role')
async def admin_role(user_id: int, request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 1000)
    await _call(auth.set_role, admin['id'], _target_id(user_id), data.get('role'))
    return {'ok': True}


@router.post('/api/admin/users/{user_id}/active')
async def admin_active(user_id: int, request: Request, admin=Depends(require_admin_write)):
    data = await read_json(request, 1000)
    if not isinstance(data.get('active'), bool):
        raise HTTPException(400, 'Cần giá trị active là true hoặc false.')
    await _call(auth.set_active, admin['id'], _target_id(user_id), data['active'])
    return {'ok': True}


@router.delete('/api/admin/users/{user_id}')
async def admin_delete(user_id: int, admin=Depends(require_admin_write)):
    if user_id == admin['id']:
        raise HTTPException(409, 'Không thể tự xóa tài khoản đang đăng nhập.')
    await _call(auth.delete_user, admin['id'], _target_id(user_id))
    return {'ok': True}


@router.get('/api/admin/resets')
async def admin_resets(admin=Depends(require_admin)):
    return await _call(auth.list_resets)


@router.post('/api/admin/resets/{reset_id}/issue')
async def admin_issue(reset_id: int, admin=Depends(require_admin_write)):
    code, minutes = await _call(auth.issue_reset, admin['id'], _target_id(reset_id))
    return {'code': code, 'valid_minutes': minutes, 'message': 'Chỉ hiển thị một lần. Gửi mã này cho người dùng qua kênh riêng.'}


@router.post('/api/admin/resets/{reset_id}/cancel')
async def admin_cancel(reset_id: int, admin=Depends(require_admin_write)):
    await _call(auth.cancel_reset, admin['id'], _target_id(reset_id))
    return {'ok': True}


@router.get('/api/admin/events')
async def admin_events(admin=Depends(require_admin)):
    return await _call(auth.events, 100)
