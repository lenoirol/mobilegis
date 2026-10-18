"""Read-only extracted package smoke against the current PostgreSQL.
Credentials go only to child environment. Not a fresh-machine installation test.
"""
import os,zipfile,subprocess,json,time,urllib.request,tempfile,socket,sys,re,http.client
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db
import psycopg

def check(archive_path):
    destination=Path(tempfile.mkdtemp(prefix='MobileGIS_pg2_package_')).resolve()
    fixed=['server.py','database.py','public/index.html','DATABASE_POSTGRESQL.md','database/DESIGN.md','database/schema.sql',
           'data/query_grid/lst_2025.bin','data/query_grid/gee_lst_2025.bin','data/query_grid/gee_recovery_lst_2025.bin',
           'data/query_grid/gee_lst_2020.bin','data/query_grid/gee_change_lst.bin','data/query_grid/gee_recovery_change_lst.bin',
           'data/gee_boundary/hcm167_GEE.zip']
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
        assert not any('.local.json' in n or n.endswith('.sqlite3') or '/config/' in n for n in archive.namelist())
        for rel in fixed:archive.extract('mobilegis/'+rel,destination)
    occupied=socket.socket()
    if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):occupied.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
    occupied.bind(('127.0.0.1',0));occupied.listen(1);preferred=occupied.getsockname()[1]
    env=os.environ.copy();cfg=db.config()
    env['MOBILEGIS_DATABASE_URL']=cfg if isinstance(cfg,str) else psycopg.conninfo.make_conninfo(**cfg)
    task_libraries=ROOT.parent/'.pg-libs'
    if task_libraries.is_dir():env['PYTHONPATH']=str(task_libraries)+os.pathsep+env.get('PYTHONPATH','')
    log_path=destination/'server.log';log=log_path.open('w',encoding='utf8')
    process=subprocess.Popen([sys.executable,'-X','utf8','server.py','--port',str(preferred),'--auto-port'],cwd=destination/'mobilegis',env=env,stdout=log,stderr=log)
    try:
        base=None
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def get(path):
            with opener.open(base+path,timeout=5) as response:return response.read()
        for attempt in range(50):
            if process.poll() is not None:raise RuntimeError('Extracted server failed to start. Check dependencies/database.')
            match=re.search(r'^MobileGIS: (http://127\.0\.0\.1:\d+)',log_path.read_text(encoding='utf8'),re.M)
            if not match:time.sleep(.15);continue
            base=match.group(1)
            try:info=json.loads(get('/api/info'));break
            except (OSError,ValueError,http.client.HTTPException):time.sleep(.15)
        else:raise RuntimeError('Package startup timed out.')
        assert info['project']==str(destination/'mobilegis') and info['port']!=preferred
        assert info['database']['engine']=='PostgreSQL / PostGIS'
        for rel in ('observations_real.json','gee/observations.json','gee_recovery/observations.json'):
            assert len(json.loads(get('/data/'+rel)))==1002
        point=json.loads(get('/api/sample?lat=10.90&lon=106.76&year=2025&index=lst&source=gee_recovery'))
        assert point['value'] is not None
        assert '2026.10.PG2' in get('/api/documents/quickstart.md').decode('utf8')
        assert info['database']['schema_version']==2
        assert all(m['rows']==3006 for m in info['database']['metric_tables'])
        assert get('/api/documents/hcm167_GEE.zip').startswith(b'PK')
        assert get('/').startswith(b'<!doctype html>')
        return {'status':'pass','version':info['version'],'postgres_version':info['database']['postgres_version'],'rows_research':3006,'auto_port_fallback':True,'recovery_sample':point['value'],'credentials_included':False,'isolated_folder':str(destination),'note':'Whole ZIP CRC + extracted-subset HTTP smoke; uses current database, not a fresh-machine install test.'}
    finally:
        process.terminate();process.wait(timeout=10);occupied.close();log.close()

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--archive',type=Path,default=ROOT.parent/'MobileGIS_POSTGRESQL_PG2.zip');a=parser.parse_args()
    print(json.dumps(check(a.archive),ensure_ascii=False,indent=2))
