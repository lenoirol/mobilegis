"""PostgreSQL repository. Runtime never opens SQLite or silently falls back to JSON."""
import csv, io, json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
if (ROOT.parent/'.pg-libs').is_dir():sys.path.insert(0,str(ROOT.parent/'.pg-libs'))
import psycopg
from psycopg.rows import dict_row

BOUNDARY='2025-reference'
SOURCES=('legacy','gee','gee_recovery')
DEMO_COLUMNS='id,name,lat,lon,year,lst,ndvi,tvdi,source'

def config():
    if os.environ.get('MOBILEGIS_DATABASE_URL'):
        return os.environ['MOBILEGIS_DATABASE_URL']
    path=ROOT/'config/database.local.json'
    if not path.is_file():
        raise RuntimeError('Chưa cấu hình PostgreSQL. Xem DATABASE_POSTGRESQL.md hoặc chạy SETUP_POSTGRESQL.cmd.')
    return json.loads(path.read_text(encoding='utf8'))

def connect():
    cfg=config()
    options={'connect_timeout':5,'row_factory':dict_row,'options':'-c statement_timeout=15000'}
    return psycopg.connect(cfg,**options) if isinstance(cfg,str) else psycopg.connect(**cfg,**options)

def health():
    with connect() as c:
        row=c.execute("SELECT current_setting('server_version') AS postgres,postgis_lib_version() AS postgis").fetchone()
        version=c.execute('SELECT max(version) AS v FROM mobilegis.schema_migrations').fetchone()['v']
        counts=c.execute('SELECT dataset_id,count(*) AS rows FROM mobilegis.unit_observations GROUP BY dataset_id ORDER BY dataset_id').fetchall()
        metrics=[]
        for k in ('lst','ndvi','tvdi'):
            count=c.execute(f'SELECT count(*) AS n FROM mobilegis.{k}_observations').fetchone()['n']
            metrics.append({'index':k,'table':k+'_observations','rows':count})
        if version not in (2,3,4) or any(m['rows']!=sum(r['rows'] for r in counts) for m in metrics) or not set(SOURCES).issubset({r['dataset_id'] for r in counts}):
            raise RuntimeError('CSDL chưa nhập đủ ba bộ nghiên cứu. Chạy thiết lập hoặc import_postgres.py bằng tài khoản chủ CSDL.')
        return {'engine':'PostgreSQL / PostGIS','postgres_version':row['postgres'],'schema_version':version,'postgis':row['postgis'],'datasets':counts,'metric_tables':metrics}

def document(key):
    with connect() as c:
        r=c.execute('SELECT payload FROM mobilegis.documents WHERE key=%s',(key,)).fetchone()
        if not r:raise KeyError(key)
        return r['payload']

def observations(source='gee_recovery',year=None,code=None,index=None,coverage=0):
    if source not in SOURCES:raise ValueError('Nguồn không hợp lệ.')
    if index and index not in ('lst','ndvi','tvdi'):raise ValueError('Chỉ số không hợp lệ.')
    query='SELECT o.payload, o.lst,o.ndvi,o.tvdi,o.lst_pixels,o.ndvi_pixels,o.tvdi_pixels,o.lst_coverage,o.ndvi_coverage,o.tvdi_coverage,o.sampled_pixels FROM mobilegis.observations_combined o WHERE dataset_id=%s'
    params=[source]
    if year is not None:query+=' AND year=%s';params.append(year)
    if code:query+=' AND code=%s';params.append(code)
    if index:query+=f' AND {index} IS NOT NULL AND {index}_coverage>=%s';params.append(coverage)
    with connect() as c:
        rows=c.execute(query+' ORDER BY code,year',params).fetchall()
    # Normalized SQL columns are authoritative, JSONB retains provenance extras.
    return [r.pop('payload')|r for r in rows]

def metric_observations(index,source='gee_recovery',year=None,code=None,coverage=0):
    if index not in ('lst','ndvi','tvdi') or source not in SOURCES:raise ValueError('Chỉ số hoặc nguồn không hợp lệ.')
    query=f'SELECT m.dataset_id,m.code,m.year,m.{index},m.valid_pixels,m.sampled_pixels,m.coverage,o.dates,a.name FROM mobilegis.{index}_observations m JOIN mobilegis.unit_observations o USING(dataset_id,code,year) JOIN mobilegis.admin_units a ON a.boundary_id=o.boundary_id AND a.code=o.code WHERE m.dataset_id=%s AND m.coverage>=%s'
    params=[source,coverage]
    if year is not None:query+=' AND m.year=%s';params.append(year)
    if code:query+=' AND m.code=%s';params.append(code)
    with connect() as c:rows=c.execute(query+' ORDER BY m.code,m.year',params).fetchall()
    return [{**r,'dates':[d.isoformat() for d in r['dates']]} for r in rows]

def boundaries(lat=None,lon=None,original=False):
    geometry='geom_original' if original else 'geom'
    query=f'SELECT code,properties,ST_AsGeoJSON({geometry},15)::json AS geometry FROM mobilegis.admin_units WHERE boundary_id=%s'
    params=[BOUNDARY]
    if lat is not None:
        query+=' AND ST_Covers(geom_original,ST_SetSRID(ST_MakePoint(%s,%s),4326))';params.extend([lon,lat])
    with connect() as c:rows=c.execute(query+' ORDER BY code',params).fetchall()
    return {'type':'FeatureCollection','features':[{'type':'Feature','id':r['code'],'properties':r['properties'],'geometry':r['geometry']} for r in rows]}

def points():
    with connect() as c:return [r['payload'] for r in c.execute("SELECT payload FROM mobilegis.point_observations WHERE dataset_id='user_csv' ORDER BY name,year")]

def cover(source):
    with connect() as c:return [r['payload'] for r in c.execute('SELECT payload FROM mobilegis.landcover_statistics WHERE dataset_id=%s ORDER BY code',(source,))]

def demo():
    with connect() as c:return c.execute(f'SELECT {DEMO_COLUMNS} FROM mobilegis.demo_observations ORDER BY name,year').fetchall()

def demo_save(values,record_id=None):
    with connect() as c:
        if record_id:
            result=c.execute('UPDATE mobilegis.demo_observations SET name=%s,lat=%s,lon=%s,year=%s,lst=%s,ndvi=%s,tvdi=%s,source=%s,updated_at=now() WHERE id=%s RETURNING id',values+(int(record_id),)).fetchone()
            if not result:raise ValueError('Bản ghi không còn tồn tại.')
        else:result=c.execute('INSERT INTO mobilegis.demo_observations(name,lat,lon,year,lst,ndvi,tvdi,source) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',values).fetchone()
        return result['id']

def demo_delete(record_id):
    with connect() as c:
        if not c.execute('DELETE FROM mobilegis.demo_observations WHERE id=%s RETURNING id',(int(record_id),)).fetchone():raise ValueError('Bản ghi không còn tồn tại.')

def demo_import(values):
    with connect() as c:
        with c.cursor() as cursor:
            cursor.executemany('INSERT INTO mobilegis.demo_observations(name,lat,lon,year,lst,ndvi,tvdi,source) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(name,year) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,lst=excluded.lst,ndvi=excluded.ndvi,tvdi=excluded.tvdi,source=excluded.source,updated_at=now()',values)

def csv_text(rows):
    if not rows:return '\ufeff'
    out=io.StringIO();w=csv.DictWriter(out,fieldnames=list(rows[0]));w.writeheader()
    for r in rows:w.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in r.items()})
    return '\ufeff'+out.getvalue()
