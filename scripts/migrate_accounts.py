"""Apply migration 004 (accounts and roles) with the database owner and grant the app role access.

Run once per database. Safe to repeat. Research tables are not modified.
    MOBILEGIS_ADMIN_PASSWORD=... python scripts/migrate_accounts.py --user <owner>
Back the database up first (pg_dump -Fc) — see DATABASE_POSTGRESQL.md.
"""
import argparse, getpass, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import database as db
import psycopg
from psycopg import sql

TABLES_RW = ('app_users', 'app_sessions', 'password_resets')
TABLES_APPEND = ('auth_events',)


def migrate(owner_user, owner_password):
    cfg = db.config()
    if not isinstance(cfg, dict):
        raise RuntimeError('Use the local JSON config for this migration.')
    target = {**cfg, 'user': owner_user, 'password': owner_password}
    role = sql.Identifier(cfg['user'])
    with psycopg.connect(**target) as conn, conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock(74052026)')
        version = conn.execute('SELECT max(version) FROM mobilegis.schema_migrations').fetchone()[0]
        if version not in (3, 4):
            raise RuntimeError(f'Schema version {version}: apply PG3 first (scripts/upgrade_analysis.py).')
        conn.execute((ROOT / 'database/migrations/004_accounts.sql').read_text(encoding='utf8'))
        for table in TABLES_RW:
            conn.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier('mobilegis', table), role))
        for table in TABLES_APPEND:
            conn.execute(sql.SQL('GRANT SELECT,INSERT ON {} TO {}').format(sql.Identifier('mobilegis', table), role))
        conn.execute(sql.SQL('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA mobilegis TO {}').format(role))
    print('Accounts migration applied (schema 4). Create the first admin with scripts/create_admin.py', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', default='postgres', help='database owner/superuser')
    args = parser.parse_args()
    password = os.environ.get('MOBILEGIS_ADMIN_PASSWORD') or getpass.getpass('PostgreSQL owner password: ')
    migrate(args.user, password)
