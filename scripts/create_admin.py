"""Create (or promote) an MobileGIS administrator account.

    python scripts/create_admin.py --email you@example.com --name "Tên hiển thị"
The password is read from MOBILEGIS_NEW_ADMIN_PASSWORD or prompted; it is never stored in files.
"""
import argparse, getpass, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import auth
import database as db


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', default='Quản trị viên')
    args = parser.parse_args()
    password = os.environ.get('MOBILEGIS_NEW_ADMIN_PASSWORD') or getpass.getpass('Mật khẩu admin mới (≥ 8 ký tự): ')
    try:
        user = auth.register(args.email, args.name, password)
    except auth.AuthError as error:
        sys.exit(f'Không tạo được: {error.message}')
    with db.connect() as c:
        c.execute("UPDATE mobilegis.app_users SET role='admin' WHERE id=%s", (user['id'],))
        auth.log_event(c, 'admin_created', user['id'], user['email'], 'create_admin.py')
    print(f"Đã tạo quản trị viên {user['email']}.")


if __name__ == '__main__':
    main()
