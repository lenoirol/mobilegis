"""Portable, checksummed derived statistics. No source rasters or observations are edited."""
import csv,gzip,hashlib,io,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db
from psycopg import sql

TABLES={
 'pixel_statistics':('dataset_id','code','year','index_name','sample_count','valid_count','minimum','maximum','mean','median','stddev','q25','q75','histogram','method','raster_sha256'),
 'index_landcover_statistics':('dataset_id','code','year','index_name','class_code','class_name','reference_year','valid_count','mean','method')}
FOLDER=ROOT/'database/seeds/analysis_pg3'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def export():
    FOLDER.mkdir(parents=True,exist_ok=True);manifest={'version':3,'kind':'derived statistics, not raw observations','tables':{}}
    with db.connect() as c:
        for table,columns in TABLES.items():
            rows=c.execute(sql.SQL('SELECT {} FROM {} ORDER BY 1,2,3,4').format(sql.SQL(',').join(map(sql.Identifier,columns)),sql.Identifier('mobilegis',table))).fetchall()
            path=FOLDER/(table+'.csv.gz')
            with gzip.open(path,'wt',encoding='utf8',newline='') as f:
                writer=csv.writer(f);writer.writerow(columns)
                for row in rows:writer.writerow([json.dumps(row[k],separators=(',',':')) if isinstance(row[k],(dict,list)) else row[k] for k in columns])
            manifest['tables'][table]={'columns':columns,'rows':len(rows),'sha256':digest(path)}
    (FOLDER/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    print('Portable PG3 statistics exported:',{k:v['rows'] for k,v in manifest['tables'].items()})

def load(conn):
    """Called inside the owner's import transaction; never overwrite existing statistics."""
    manifest_path=FOLDER/'manifest.json'
    if not manifest_path.exists():raise ValueError('Missing PG3 statistics seed; export or rebuild it before distributing the project.')
    manifest=json.loads(manifest_path.read_text(encoding='utf8'))
    if manifest.get('version')!=3:raise ValueError('Unsupported statistics seed version.')
    for table,columns in TABLES.items():
        info=manifest['tables'][table];path=FOLDER/(table+'.csv.gz')
        if list(columns)!=info['columns'] or digest(path)!=info['sha256']:raise ValueError('Statistics seed integrity check failed: '+table)
        names=sql.SQL(',').join(map(sql.Identifier,columns));temp=sql.Identifier('seed_'+table)
        conn.execute(sql.SQL('CREATE TEMP TABLE {} (LIKE {} INCLUDING DEFAULTS) ON COMMIT DROP').format(temp,sql.Identifier('mobilegis',table)))
        with gzip.open(path,'rt',encoding='utf8',newline='') as f:
            if tuple(next(csv.reader(f)))!=columns:raise ValueError('Statistics seed header differs.')
            with conn.cursor().copy(sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT CSV, NULL '')").format(temp,names)) as copy:
                while chunk:=f.read(1024*1024):copy.write(chunk)
        n=conn.execute(sql.SQL('SELECT count(*) FROM {}').format(temp)).fetchone()
        if (n['count'] if isinstance(n,dict) else n[0])!=info['rows']:raise ValueError('Statistics seed count differs.')
        conn.execute(sql.SQL('INSERT INTO {} ({}) SELECT {} FROM {} ON CONFLICT DO NOTHING').format(sql.Identifier('mobilegis',table),names,names,temp))
        conn.execute(sql.SQL('DROP TABLE {}').format(temp))
    for k in ('lst','ndvi','tvdi'):
        wrong=conn.execute(sql.SQL('''SELECT count(*) AS n FROM mobilegis.pixel_statistics s
          JOIN mobilegis.{} m USING(dataset_id,code,year)
          WHERE s.index_name=%s AND (s.valid_count<>m.valid_pixels OR s.sample_count<>m.sampled_pixels
          OR (m.{} IS NOT NULL AND abs(s.mean-m.{})>0.0001))''').format(sql.Identifier(k+'_observations'),sql.Identifier(k),sql.Identifier(k)),(k,)).fetchone()
        if (wrong['n'] if isinstance(wrong,dict) else wrong[0]):raise ValueError('Statistics differ from original observations.')

if __name__=='__main__':export()
