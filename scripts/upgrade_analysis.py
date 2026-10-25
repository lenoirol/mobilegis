"""Back up and apply PG3 to the configured database, with explicit owner credentials."""
import argparse, getpass, json, os, subprocess, sys
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db
import psycopg
from psycopg import sql

def upgrade(owner, backup=True):
    cfg=db.config()
    if not isinstance(cfg,dict):raise RuntimeError('Use the local JSON config for this upgrade.')
    target={**cfg,'user':owner.get('user','postgres'),'password':owner['password']}
    with psycopg.connect(**target,row_factory=psycopg.rows.dict_row) as c:
        v=c.execute('SELECT max(version) AS v FROM mobilegis.schema_migrations').fetchone()['v']
        if v not in (2,3):raise RuntimeError('Only PG2/PG3 can be upgraded.')
    if backup:
        binary=Path(r'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe')
        if not binary.exists():binary=ROOT.parent/'.pg-runtime/pgsql/bin/pg_dump.exe'
        folder=ROOT.parent/'mobilegis_luu_tru_20261011/truoc_nang_cap_pg3';folder.mkdir(parents=True,exist_ok=True)
        destination=folder/('database_'+datetime.now().strftime('%Y%m%d_%H%M%S')+'.backup')
        env={**os.environ,'PGPASSWORD':target['password']}
        subprocess.run([str(binary),'-h',target['host'],'-p',str(target['port']),'-U',target['user'],
                        '-d',target['dbname'],'-Fc','--no-owner','--file',str(destination)],env=env,check=True)
        print('Backup:',destination,flush=True)
    with psycopg.connect(**target,row_factory=psycopg.rows.dict_row) as c:
        with c.transaction():
            c.execute('SELECT pg_advisory_xact_lock(74052025)')
            c.execute((ROOT/'database/migrations/003_analysis_results.sql').read_text(encoding='utf8'))
            grant_access(c,cfg['user'])
    print('PG3 migration completed; original research values preserved.',flush=True)

def grant_access(c,role):
    c.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA mobilegis TO {}').format(sql.Identifier(role)))
    for table in ('analysis_runs','result_units','lst_results','ndvi_results','tvdi_results'):
        c.execute(sql.SQL('GRANT INSERT ON {} TO {}').format(sql.Identifier('mobilegis',table),sql.Identifier(role)))
    row=c.execute("SELECT to_regclass('mobilegis.app_users') IS NOT NULL AS ok").fetchone()
    if row['ok'] if isinstance(row,dict) else row[0]:  # accounts exist only from schema 4
        for table in ('app_users','app_sessions','password_resets'):
            c.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier('mobilegis',table),sql.Identifier(role)))
        c.execute(sql.SQL('GRANT SELECT,INSERT ON mobilegis.auth_events TO {}').format(sql.Identifier(role)))
        for table in ('user_favorites','feedback','site_settings','area_notes','highlights','usage_counts','perf_runs','survey_responses'):   # schema 5-7 (engagement, field tests), present only once those migrations ran
            exists=c.execute("SELECT to_regclass(%s) IS NOT NULL AS ok",('mobilegis.'+table,)).fetchone()
            if exists['ok'] if isinstance(exists,dict) else exists[0]:
                c.execute(sql.SQL('GRANT SELECT,INSERT,UPDATE,DELETE ON {} TO {}').format(sql.Identifier('mobilegis',table),sql.Identifier(role)))
        c.execute(sql.SQL('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA mobilegis TO {}').format(sql.Identifier(role)))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--user',default='postgres');p.add_argument('--no-backup',action='store_true');a=p.parse_args()
    password=os.environ.get('MOBILEGIS_ADMIN_PASSWORD') or getpass.getpass('PostgreSQL admin password: ')
    upgrade({'user':a.user,'password':password},not a.no_backup)
