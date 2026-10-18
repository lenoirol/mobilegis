"""Copy the `mobilegis` schema (28 tables) from the local PostgreSQL to a Supabase project, then verify it.

Reads config/supabase.local.json (git-ignored; see config/supabase.example.json):
    owner_dsn  connection string of the Supabase `postgres` user (used only here, to create PostGIS, the app role and restore)
    dsn        connection string of the application role `mobilegis_app` (used by the server at run time)
The app role's password is taken from `dsn`; nothing secret is printed or written anywhere else.

It REFUSES to overwrite: if schema `mobilegis` already exists on the target it stops. Local data is never modified.

    .venv/bin/python scripts/migrate_to_supabase.py --backup database/backups/mobilegis_schema4_20261018.backup
    .venv/bin/python scripts/migrate_to_supabase.py --verify-only        # re-check counts later
"""
import argparse, glob, json, os, shutil, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from psycopg.rows import dict_row
import database as db

CONFIG = Path(os.environ['MOBILEGIS_SUPABASE_CONFIG']) if os.environ.get('MOBILEGIS_SUPABASE_CONFIG') else ROOT / 'config/supabase.local.json'
SCHEMA = 'mobilegis'


def load_config():
    if not CONFIG.is_file():
        sys.exit(f'Chưa có {CONFIG.relative_to(ROOT)}. Sao chép config/supabase.example.json và điền chuỗi kết nối (xem SUPABASE_HUONG_DAN.md).')
    cfg = json.loads(CONFIG.read_text(encoding='utf8'))
    for key in ('owner_dsn', 'dsn'):
        if not cfg.get(key) or 'ĐIỀN' in cfg[key] or '[' in cfg[key]:
            sys.exit(f'Trường "{key}" trong config/supabase.local.json chưa được điền.')
    return cfg


def describe(dsn):
    info = conninfo_to_dict(dsn)
    return f"{info.get('user', '?')}@{info.get('host', '?')}:{info.get('port', '5432')}/{info.get('dbname', 'postgres')}"


def app_role(dsn):
    """Supabase poolers use `role.projectref`; the real role is the part before the first dot."""
    info = conninfo_to_dict(dsn)
    return info['user'].split('.')[0], info.get('password')


def find_binary(name):
    found = shutil.which(name)
    if found:
        return found
    patterns = [f'/Library/PostgreSQL/*/bin/{name}', f'/Applications/Postgres.app/Contents/Versions/*/bin/{name}', f'/opt/homebrew/opt/libpq/bin/{name}', f'/opt/homebrew/opt/postgresql@*/bin/{name}']
    for pattern in patterns:
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[-1]
    sys.exit(f'Không tìm thấy {name}. Cài PostgreSQL client (ví dụ brew install libpq) hoặc dùng --pg-restore <đường dẫn>.')


def source_counts():
    with db.connect() as c:
        tables = [r['table_name'] for r in c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=%s AND table_type='BASE TABLE' ORDER BY 1", (SCHEMA,)).fetchall()]
        return {t: c.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier(SCHEMA, t))).fetchone()['n'] for t in tables}


def verify(app_dsn):
    print('\n== Kiểm tra sau khi chuyển ==')
    expected = source_counts()
    with psycopg.connect(db.with_ssl(app_dsn), row_factory=dict_row, connect_timeout=15) as c:
        actual = {t: c.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier(SCHEMA, t))).fetchone()['n'] for t in expected}
        valid = c.execute('SELECT count(*) AS n FROM mobilegis.admin_units WHERE ST_IsValid(geom) AND ST_SRID(geom)=4326').fetchone()['n']
        version = c.execute('SELECT max(version) AS v FROM mobilegis.schema_migrations').fetchone()['v']
        postgis = c.execute('SELECT postgis_lib_version() AS v').fetchone()['v']
    bad = {t: (expected[t], actual[t]) for t in expected if expected[t] != actual[t]}
    print(f'  {len(expected)} bảng, tổng {sum(actual.values()):,} dòng; schema {version}; PostGIS {postgis}; hình học hợp lệ {valid}/167')
    if bad:
        print('  LỆCH SỐ DÒNG (nguồn, đích):', bad)
    os.environ['MOBILEGIS_DATABASE_URL'] = db.with_ssl(app_dsn)
    try:
        health = db.health()
        print(f"  API health: OK · {[d['dataset_id'] + ':' + str(d['rows']) for d in health['datasets']]}")
    finally:
        os.environ.pop('MOBILEGIS_DATABASE_URL', None)
    ok = not bad and valid == 167 and version == 4
    print('  KẾT QUẢ:', 'ĐẠT' if ok else 'KHÔNG ĐẠT')
    return ok


def migrate(args, cfg):
    owner_dsn = db.with_ssl(cfg['owner_dsn'])
    role, password = app_role(cfg['dsn'])
    if not password:
        sys.exit('Chuỗi "dsn" của role ứng dụng cần có mật khẩu.')
    backup = Path(args.backup)
    if not backup.is_file():
        sys.exit(f'Không thấy file backup: {backup}')
    print(f'Nguồn : máy này (đọc số dòng để đối chiếu)\nĐích  : {describe(owner_dsn)}\nRole ứng dụng sẽ dùng: {role}\n')
    with psycopg.connect(owner_dsn, autocommit=True, connect_timeout=20) as admin:
        info = admin.execute("SELECT current_setting('server_version') AS v, current_user AS u").fetchone()
        print(f'1. Kết nối owner OK · PostgreSQL {info[0]} · user {info[1]}')
        if admin.execute('SELECT 1 FROM information_schema.schemata WHERE schema_name=%s', (SCHEMA,)).fetchone():
            sys.exit('DỪNG: schema "mobilegis" đã tồn tại trên Supabase. Script không ghi đè. Dùng --verify-only để kiểm tra, hoặc tự xóa schema nếu chắc chắn.')
        if not admin.execute("SELECT 1 FROM pg_available_extensions WHERE name='postgis'").fetchone():
            sys.exit('DỪNG: project này chưa cung cấp PostGIS.')
        admin.execute('CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public')   # the dump references public.geometry / public.st_*
        print('2. PostGIS đã bật trong schema public')
        if admin.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
            print(f'3. Role {role} đã có; giữ nguyên mật khẩu hiện tại')
        else:
            admin.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}').format(sql.Identifier(role), sql.Literal(password)))
            print(f'3. Đã tạo role {role} (quyền tối thiểu)')
    parts = conninfo_to_dict(owner_dsn)
    secret = parts.pop('password', None)
    env = {**os.environ, **({'PGPASSWORD': secret} if secret else {})}   # keep the password out of the process list
    restore = args.pg_restore or find_binary('pg_restore')
    print('4. Đang khôi phục (một giao dịch duy nhất; lỗi thì hoàn tác toàn bộ)…', flush=True)
    result = subprocess.run([restore, '--no-owner', '--single-transaction', '--exit-on-error', '-d', make_conninfo(**parts), str(backup)], env=env, capture_output=True, text=True)
    if result.returncode:
        print(result.stderr[-1500:])
        sys.exit('KHÔNG KHÔI PHỤC ĐƯỢC. Supabase không bị thay đổi vì dùng một giao dịch. Gửi mình đoạn lỗi trên (đã không chứa mật khẩu).')
    with psycopg.connect(owner_dsn, autocommit=True) as admin:
        # Grants are re-applied for the configured role, whatever its name, using the same rules as local installs.
        who = sql.Identifier(role)
        for statement in ('GRANT USAGE ON SCHEMA mobilegis TO {}', 'GRANT SELECT ON ALL TABLES IN SCHEMA mobilegis TO {}',
                          'GRANT INSERT,UPDATE,DELETE ON mobilegis.demo_observations TO {}', 'REVOKE INSERT,UPDATE,DELETE ON mobilegis.audit_log FROM {}',
                          'GRANT EXECUTE ON FUNCTION mobilegis.audit_demo() TO {}', 'GRANT USAGE,SELECT ON SEQUENCE mobilegis.demo_observations_id_seq TO {}'):
            admin.execute(sql.SQL(statement).format(who))
        sys.path.insert(0, str(ROOT / 'scripts'))
        from upgrade_analysis import grant_access   # analysis-result inserts and the account tables
        grant_access(admin, role)
        admin.execute(sql.SQL('REVOKE USAGE,SELECT ON SEQUENCE mobilegis.audit_log_id_seq FROM {}').format(who))   # the audit log stays append-only via trigger
        print(f'5. Đã cấp quyền tối thiểu cho role {role}')
        for target in ('anon', 'authenticated'):   # the Data API roles must never see business tables or the PostGIS reference table
            if admin.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (target,)).fetchone():
                admin.execute(sql.SQL('REVOKE ALL ON ALL TABLES IN SCHEMA mobilegis FROM {}').format(sql.Identifier(target)))
                admin.execute(sql.SQL('REVOKE ALL ON SCHEMA mobilegis FROM {}').format(sql.Identifier(target)))
                admin.execute(sql.SQL('REVOKE ALL ON public.spatial_ref_sys FROM {}').format(sql.Identifier(target)))
        print('6. Đã thu hồi quyền của anon/authenticated (Data API không truy cập được dữ liệu)')
    return verify(cfg['dsn'])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--backup', help='file .backup tạo bằng pg_dump -Fc -n mobilegis --no-owner')
    parser.add_argument('--pg-restore', help='đường dẫn pg_restore nếu không nằm trong PATH')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    cfg = load_config()
    if args.verify_only:
        sys.exit(0 if verify(cfg['dsn']) else 1)
    if not args.backup:
        parser.error('cần --backup (hoặc --verify-only)')
    ok = migrate(args, cfg)
    if ok:
        print('\nXong. Chạy máy chủ với Supabase:\n  MOBILEGIS_DB_CONFIG=config/supabase.local.json .venv/bin/python server.py --port 5379 --auto-port')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
