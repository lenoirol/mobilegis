"""Manage only the dedicated task-local cluster, or configure an existing server.
Never stops another PostgreSQL installation or modifies OS services/firewall.
"""
import argparse,getpass,json,os,secrets,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db
import psycopg
from psycopg import sql
from import_postgres import import_all

OWNER=ROOT/'config/owner.local.json'
APP=ROOT/'config/database.local.json'
STATE=ROOT/'config/cluster.local.json'
def save(path,data):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data,indent=2),encoding='utf8')
def run(args):
    p=subprocess.run([str(x) for x in args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf8',errors='replace',timeout=55)
    if p.returncode:raise RuntimeError(p.stdout[-2500:])
    return p.stdout
def start(force_private=False):
    if not STATE.exists():return
    st=json.loads(STATE.read_text());bin=Path(st['bin']);cluster=Path(st['cluster'])
    # Starting the web must not start an unrelated test cluster after switching
    # to the user's installed PostgreSQL, or when an environment DSN is active.
    if not force_private:
        if os.environ.get('MOBILEGIS_DATABASE_URL'):return
        if APP.exists():
            configured=json.loads(APP.read_text())
            if str(configured.get('port'))!=str(st['port']) or configured.get('host') not in ('127.0.0.1','localhost'):return
    status=subprocess.run([str(bin/'pg_ctl.exe'),'-D',str(cluster),'status'],capture_output=True)
    if status.returncode==0:return
    run([bin/'pg_ctl.exe','-D',cluster,'-l',cluster.parent/'postgres.log','-o',f"-p {st['port']} -h 127.0.0.1",'-w','-t','45','start'])
def ensure_target_compatible(c):
    """Refuse to reuse a database belonging to another application."""
    tables=c.execute("""SELECT n.nspname,c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
            AND d.objid=c.oid AND d.deptype='e')""").fetchall()
    if not tables:return
    if any(r['nspname']!='mobilegis' for r in tables):
        raise RuntimeError('Database mobilegis có bảng thuộc ứng dụng khác. Không nhập hoặc ghi đè; chọn một database riêng trước.')
    if not c.execute("SELECT to_regclass('mobilegis.schema_migrations') AS t").fetchone()['t']:
        raise RuntimeError('Schema mobilegis đã tồn tại nhưng chưa xác minh được nguồn gốc. Không tự ghi đè.')
    versions=c.execute('SELECT version FROM mobilegis.schema_migrations ORDER BY version').fetchall()
    if [r['version'] for r in versions] not in ([1],[1,2],[1,2,3],[1,2,3,4]):
        raise RuntimeError('Phiên bản schema không tương thích. Cần migration rõ ràng, không tự ghi đè.')

def setup(runtime=None,existing=False):
    if existing and os.environ.get('MOBILEGIS_OWNER_DATABASE_URL'):
        owner=os.environ['MOBILEGIS_OWNER_DATABASE_URL']
    elif existing:
        owner={'host':input('Host [127.0.0.1]: ').strip() or '127.0.0.1',
               'port':int(input('Port [5432]: ').strip() or '5432'),'dbname':'postgres',
               'user':input('Admin user [postgres]: ').strip() or 'postgres',
               'password':getpass.getpass('Admin password (hidden): ')}
    elif OWNER.exists():owner=json.loads(OWNER.read_text());start(force_private=True)
    elif os.environ.get('MOBILEGIS_OWNER_DATABASE_URL'):
        owner=os.environ['MOBILEGIS_OWNER_DATABASE_URL']
    else:
        runtime=Path(runtime or ROOT.parent/'.pg-runtime').resolve();bin=runtime/'pgsql/bin'
        if not (bin/'pg_ctl.exe').is_file():raise RuntimeError('Chưa có PostgreSQL. Cài PostgreSQL + PostGIS hoặc đặt binaries trong .pg-runtime/pgsql. Xem DATABASE_POSTGRESQL.md.')
        cluster=runtime/'cluster';password=secrets.token_urlsafe(32)
        if cluster.exists():raise RuntimeError('Cluster tồn tại nhưng không có cấu hình owner. Không tự ghi đè; khôi phục cấu hình hoặc dùng thư mục mới.')
        pw=runtime/'owner-password.txt';pw.write_text(password,encoding='utf8')
        run([bin/'initdb.exe','-D',cluster,'-U','mobilegis_owner','--auth-host=scram-sha-256','--auth-local=scram-sha-256',f'--pwfile={pw}','--encoding=UTF8','--locale=C'])
        owner={'host':'127.0.0.1','port':55432,'dbname':'postgres','user':'mobilegis_owner','password':password}
        save(OWNER,owner);save(STATE,{'bin':str(bin),'cluster':str(cluster),'port':55432});start(force_private=True)
    # Bootstrap only the dedicated mobilegis database; never replace another DB.
    with (psycopg.connect(owner,autocommit=True) if isinstance(owner,str) else psycopg.connect(**owner,autocommit=True)) as c:
        if not c.execute("SELECT 1 FROM pg_available_extensions WHERE name='postgis'").fetchone():
            raise RuntimeError('PostGIS chưa được cài cho PostgreSQL này. Dùng Stack Builder → Spatial Extensions → PostGIS Bundle rồi chạy lại. Không thay thế bằng hình học JSON.')
        if not c.execute("SELECT 1 FROM pg_database WHERE datname='mobilegis'").fetchone():c.execute('CREATE DATABASE mobilegis')
        owner_params=dict(c.info.get_parameters())
        # libpq omits parameters equal to defaults (notably port 5432).
        owner_params.update(host=c.info.host,port=c.info.port,dbname='mobilegis',user=c.info.user)
        # get_parameters intentionally does not supply passwords; preserve explicitly.
        if isinstance(owner,dict):owner_params['password']=owner['password']
        else:owner_params['password']=psycopg.conninfo.conninfo_to_dict(owner).get('password','')
    with psycopg.connect(**owner_params,row_factory=psycopg.rows.dict_row) as c:
        ensure_target_compatible(c)
        c.rollback()  # end the read-only preflight before the import transaction
        counts=import_all(c)
        previous=json.loads(APP.read_text()) if APP.exists() else {}
        same=all(str(previous.get(k))==str(owner_params[k]) for k in ('host','port','dbname'))
        app_cfg=previous if same else {k:owner_params[k] for k in ('host','port','dbname')}
        app_cfg.setdefault('user','mobilegis_app');app_cfg.setdefault('password',secrets.token_urlsafe(32))
        role=sql.Identifier(app_cfg['user'])
        if not c.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',(app_cfg['user'],)).fetchone():
            c.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}').format(role,sql.Literal(app_cfg['password'])))
        elif not same:raise RuntimeError('Tên role ứng dụng đã tồn tại; không tự đổi mật khẩu. Cấu hình kết nối rõ ràng.')
        c.execute(sql.SQL('GRANT CONNECT ON DATABASE mobilegis TO {}').format(role))
        c.execute(sql.SQL('GRANT USAGE ON SCHEMA mobilegis TO {}').format(role))
        c.execute(sql.SQL('GRANT SELECT ON ALL TABLES IN SCHEMA mobilegis TO {}').format(role))
        c.execute(sql.SQL('GRANT INSERT,UPDATE,DELETE ON mobilegis.demo_observations TO {}').format(role))
        c.execute(sql.SQL('REVOKE INSERT,UPDATE,DELETE ON mobilegis.audit_log FROM {}').format(role))
        c.execute(sql.SQL('GRANT EXECUTE ON FUNCTION mobilegis.audit_demo() TO {}').format(role))
        c.execute(sql.SQL('GRANT USAGE,SELECT ON SEQUENCE mobilegis.demo_observations_id_seq TO {}').format(role))
        c.execute(sql.SQL('REVOKE USAGE,SELECT ON SEQUENCE mobilegis.audit_log_id_seq FROM {}').format(role))
    if previous and not same:save(ROOT/'config/previous-database.local.json',previous)
    from upgrade_analysis import grant_access
    with psycopg.connect(**owner_params) as c:grant_access(c,app_cfg['user'])
    save(APP,app_cfg)
    if existing:save(ROOT/'config/external.local.json',{'host':owner_params['host'],'port':owner_params['port'],'engine':'existing PostgreSQL installation'})
    print('PostgreSQL/PostGIS ready. Research: '+str(counts)+'. Credentials saved locally, not printed.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['setup','setup-existing','start','stop','status']);parser.add_argument('--runtime-root');a=parser.parse_args()
    try:
        if a.action=='setup':setup(a.runtime_root)
        elif a.action=='setup-existing':setup(existing=True)
        elif a.action=='start':start()
        elif a.action=='status':print(json.dumps(db.health(),ensure_ascii=False))
        elif STATE.exists():
            st=json.loads(STATE.read_text());run([Path(st['bin'])/'pg_ctl.exe','-D',st['cluster'],'-m','fast','-w','-t','45','stop']);print('Dedicated local cluster stopped; data preserved.')
    except Exception as e:
        # Never echo a DSN/password; psycopg errors may contain connection parameters.
        print('PostgreSQL setup/start failed. '+(str(e) if isinstance(e,RuntimeError) else type(e).__name__)+'. See DATABASE_POSTGRESQL.md.',file=sys.stderr);sys.exit(1)
