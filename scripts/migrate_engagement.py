"""Apply migrations 005 (saved areas, feedback, site notice), 006 (area notes, highlights, usage counters) and 007 (speed runs, usability survey) and grant the app role access.

Run once per database; safe to repeat. Research tables are not modified.
  Local:    MOBILEGIS_ADMIN_PASSWORD=... python scripts/migrate_engagement.py --user <owner>
  Supabase: python scripts/migrate_engagement.py --supabase        (uses owner_dsn in config/supabase.local.json; nothing secret is printed)
"""
import argparse, getpass, json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import database as db
import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

MIGRATIONS = ('005_engagement.sql', '006_content.sql', '007_field_tests.sql')   # applied in order; each is idempotent
RW = ('user_favorites', 'feedback', 'site_settings', 'area_notes', 'highlights', 'usage_counts', 'perf_runs', 'survey_responses')


def apply(conn, role):
    conn.execute('SELECT pg_advisory_xact_lock(74052026)')
    if conn.execute("SELECT to_regclass('mobilegis.app_users')").fetchone()[0] is None:
        raise RuntimeError('Chưa có bảng tài khoản (schema 4). Chạy scripts/migrate_accounts.py trước.')
    for name in MIGRATIONS:
        conn.execute((ROOT / 'database/migrations' / name).read_text(encoding='utf8'))
    who = sql.Identifier(role)
    for table in RW:
        conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier('mobilegis', table), who))
    conn.execute(sql.SQL('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA mobilegis TO {}').format(who))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--user', default='postgres'); parser.add_argument('--supabase', action='store_true')
    args = parser.parse_args()
    if args.supabase:
        cfg = json.loads((Path(os.environ.get('MOBILEGIS_SUPABASE_CONFIG') or ROOT / 'config/supabase.local.json')).read_text(encoding='utf8'))
        role = conninfo_to_dict(cfg['dsn'])['user'].split('.')[0]
        conn = psycopg.connect(db.with_ssl(cfg['owner_dsn']), connect_timeout=20)
    else:
        cfg = db.config()
        if not isinstance(cfg, dict):
            sys.exit('Dùng cấu hình JSON cục bộ hoặc thêm --supabase.')
        password = os.environ.get('MOBILEGIS_ADMIN_PASSWORD') or (getpass.getpass('PostgreSQL owner password: ') if args.user != 'phuhuy' else '')
        role = cfg['user']; conn = psycopg.connect(**{**cfg, 'user': args.user, 'password': password})
    with conn, conn.transaction():
        apply(conn, role)
        print('Đã áp dụng migration 005, 006 và 007 (schema 7).')


if __name__ == '__main__':
    main()
