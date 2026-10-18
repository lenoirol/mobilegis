"""Transactional import into a dedicated PostgreSQL database, never fabricated values."""
import hashlib,json,os,sys
from datetime import date
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database as db
from psycopg.types.json import Jsonb
from psycopg import sql

ROOT=db.ROOT
def read(rel):return json.loads((ROOT/rel).read_text(encoding='utf8'))
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        while chunk:=f.read(1024*1024):h.update(chunk)
    return h.hexdigest()

def import_all(conn):
    """Caller connects as owner. All schema+data changes commit or roll back together."""
    with conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock(74052025)')
        conn.execute((ROOT/'database/schema.sql').read_text(encoding='utf8'))
        conn.execute((ROOT/'database/migrations/002_split_indices.sql').read_text(encoding='utf8'))
        # A published version is immutable. Changed files require explicit new version/migration.
        paths=['public/data/hcm_167.geojson','public/data/observations_real.json',
               'public/data/observations_user.json','public/data/gee/observations.json',
               'public/data/gee_recovery/observations.json','public/data/gee/products.json',
               'public/data/gee_recovery/products.json','public/data/landsat_manifest.json',
               'public/data/boundary_source.json','public/data/user_csv_source.json',
               'public/data/visual_products.json','public/data/landcover_stats.json',
               'public/data/gee/landcover_stats.json','data/query_grid/metadata.json',
               'database/seeds/boundaries_original.geojson']
        for rel in paths:
            sha=digest(ROOT/rel)
            old=conn.execute('SELECT sha256 FROM mobilegis.documents WHERE key=%s',(rel,)).fetchone()
            if old and old['sha256']!=sha:raise ValueError(f'Published source changed: {rel}. Create an explicit versioned migration.')
            conn.execute('INSERT INTO mobilegis.documents(key,payload,sha256) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(rel,Jsonb(read(rel)),sha))
        conn.execute('INSERT INTO mobilegis.boundary_versions(id,reference_year,description,metadata) VALUES(%s,2025,%s,%s) ON CONFLICT DO NOTHING',
                     (db.BOUNDARY,'167 reference units, excludes Con Dao; same 2025 boundaries for 2020–2025, not historical/cadastral boundaries',Jsonb(read('public/data/boundary_source.json'))))
        geo=read('public/data/hcm_167.geojson')
        original={f['id']:f['geometry'] for f in read('database/seeds/boundaries_original.geojson')['features']}
        assert len(geo['features'])==167
        for f in geo['features']:
            conn.execute('INSERT INTO mobilegis.admin_units(boundary_id,code,name,properties,geom,geom_original) VALUES(%s,%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) ON CONFLICT(boundary_id,code) DO UPDATE SET geom_original=excluded.geom_original WHERE mobilegis.admin_units.geom_original IS NULL',
                         (db.BOUNDARY,str(f['id']),f['properties']['full_name'],Jsonb(f['properties']),json.dumps(f['geometry']),json.dumps(original[f['id']])))
            if not conn.execute('SELECT ST_Equals(geom_original,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) AS matches FROM mobilegis.admin_units WHERE boundary_id=%s AND code=%s',(json.dumps(original[f['id']]),db.BOUNDARY,f['id'])).fetchone()['matches']:
                raise ValueError('Original polygon differs from the published seed: '+f['id'])
        conn.execute('ALTER TABLE mobilegis.admin_units ALTER COLUMN geom_original SET NOT NULL')
        datasets=[('legacy','USGS / Planetary Computer previous processing','public/data/observations_real.json','public/data/landsat_manifest.json',None),
                  ('gee','GEE original 2020–2025','public/data/gee/observations.json','public/data/gee/products.json',None),
                  ('gee_recovery','GEE 2020–2025 with five-unit 2025 recovery','public/data/gee_recovery/observations.json','public/data/gee_recovery/products.json','gee')]
        for source,title,rows_path,meta_path,parent in datasets:
            meta=read(meta_path)
            conn.execute('INSERT INTO mobilegis.datasets(id,title,kind,boundary_id,parent_id,metadata) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',(source,title,'research',db.BOUNDARY,parent,Jsonb(meta)))
            rows=read(rows_path)
            assert len(rows)==1002 and len({(r['code'],r['year']) for r in rows})==1002
            assert all(sum(r['year']==y for r in rows)==167 for y in range(2020,2026))
            for r in rows:
                values=(source,db.BOUNDARY,r['code'],r['year'],r['sampled_pixels'],[date.fromisoformat(x) for x in r['dates']],Jsonb(r))
                conn.execute('INSERT INTO mobilegis.unit_observations(dataset_id,boundary_id,code,year,sampled_pixels,dates,payload) VALUES('+','.join(['%s']*7)+') ON CONFLICT DO NOTHING',values)
                for k in ('lst','ndvi','tvdi'):
                    query=sql.SQL('INSERT INTO {}(dataset_id,code,year,{},valid_pixels,sampled_pixels,coverage) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING').format(sql.Identifier('mobilegis',k+'_observations'),sql.Identifier(k))
                    conn.execute(query,(source,r['code'],r['year'],r[k],r[k+'_pixels'],r['sampled_pixels'],r[k+'_coverage']))
            # Re-import must not silently retain inconsistent scalar measurements.
            actual=conn.execute('SELECT code,year,lst,ndvi,tvdi,lst_pixels,ndvi_pixels,tvdi_pixels,lst_coverage,ndvi_coverage,tvdi_coverage,sampled_pixels FROM mobilegis.observations_combined WHERE dataset_id=%s',(source,)).fetchall()
            expected={(r['code'],r['year']):r for r in rows}
            for a in actual:
                if any(a[k]!=expected[a['code'],a['year']][k] for k in a):raise ValueError('Published metric differs in PostgreSQL: '+source)
            scenes={}
            if source=='legacy':
                for y in meta['years']:
                    for s in y['scenes']:scenes[y['year'],s['id']]=(s.get('datetime',s.get('date',''))[:10],s)
            else:
                for year,a in meta['audits'].items():
                    for s in a['scenes']:scenes[int(year),s['LANDSAT_PRODUCT_ID']]=(s['acquisition_date'],s)
            # Include per-unit provenance identifiers; record explicit metadata if candidate list differs.
            for r in rows:
                for sid in r.get('scene_ids',[]):
                    if (r['year'],sid) not in scenes:
                        try:d=date.fromisoformat(sid.split('_')[3][:4]+'-'+sid.split('_')[3][4:6]+'-'+sid.split('_')[3][6:8]).isoformat()
                        except (IndexError,ValueError):raise ValueError('Scene has no verifiable date: '+sid)
                        scenes[r['year'],sid]=(d,{'id':sid,'origin':'unit provenance; other metadata absent'})
            for (year,sid),(acq,metadata) in scenes.items():
                conn.execute('INSERT INTO mobilegis.satellite_scenes(dataset_id,year,scene_id,acquisition_date,metadata) VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',(source,year,sid,acq,Jsonb(metadata)))
            for r in rows:
                for sid in r.get('scene_ids',[]):conn.execute('INSERT INTO mobilegis.observation_scenes VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(source,r['code'],r['year'],sid))
            covers=read('public/data/landcover_stats.json' if source=='legacy' else 'public/data/gee/landcover_stats.json')
            for r in covers:conn.execute('INSERT INTO mobilegis.landcover_statistics VALUES(%s,%s,%s,2021,%s) ON CONFLICT DO NOTHING',(source,db.BOUNDARY,r['code'],Jsonb(r)))
        conn.execute("INSERT INTO mobilegis.datasets(id,title,kind,metadata) VALUES('user_csv','Four user-supplied points, not independently reproduced','user_points',%s) ON CONFLICT DO NOTHING",(Jsonb(read('public/data/user_csv_source.json')),))
        conn.execute("INSERT INTO mobilegis.datasets(id,title,kind) VALUES('demo','Editable synthetic practice points','demo') ON CONFLICT DO NOTHING")
        for r in read('public/data/observations_user.json'):
            conn.execute('INSERT INTO mobilegis.point_observations(dataset_id,name,year,lat,lon,payload) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',('user_csv',r['name'],r['year'],r['lat'],r['lon'],Jsonb(r)))
        migrated=conn.execute("SELECT 1 FROM mobilegis.documents WHERE key='migration/demo-snapshot'").fetchone()
        if not migrated and not conn.execute('SELECT count(*) AS n FROM mobilegis.demo_observations').fetchone()['n']:
            for r in read('database/seeds/demo_legacy.json')['rows']:
                conn.execute('INSERT INTO mobilegis.demo_observations(id,name,lat,lon,year,lst,ndvi,tvdi,source) VALUES('+','.join(['%s']*9)+')',tuple(r[k] for k in db.DEMO_COLUMNS.split(',')))
            conn.execute("SELECT setval(pg_get_serial_sequence('mobilegis.demo_observations','id'),GREATEST((SELECT max(id) FROM mobilegis.demo_observations),1))")
        seed=ROOT/'database/seeds/demo_legacy.json'
        conn.execute("INSERT INTO mobilegis.documents(key,payload,sha256) VALUES('migration/demo-snapshot',%s,%s) ON CONFLICT DO NOTHING",(Jsonb(read('database/seeds/demo_legacy.json')),digest(seed)))
        # Individual GeoTIFFs and originals: bytes stay on disk; hash and origin stay in SQL.
        for folder,source in [('data/gee','gee'),('data/gee_recovery/batch1_20261004','gee_recovery'),('data/rasters','legacy'),('data/context','legacy')]:
            for path in (ROOT/folder).rglob('*'):
                if not path.is_file() or path.suffix.lower() not in ('.tif','.csv'):continue
                rel=path.relative_to(ROOT).as_posix();sha=digest(path)
                old=conn.execute('SELECT sha256 FROM mobilegis.asset_catalog WHERE dataset_id=%s AND relative_path=%s',(source,rel)).fetchone()
                if old and old['sha256']!=sha:raise ValueError('Immutable asset changed: '+rel)
                conn.execute('INSERT INTO mobilegis.asset_catalog(dataset_id,relative_path,kind,size_bytes,sha256,metadata) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',(source,rel,'original' if '/originals/' in rel else 'processed',path.stat().st_size,sha,Jsonb({'format':path.suffix.lstrip('.'),'storage':'local files; portable to object storage'})))
        counts=conn.execute('SELECT dataset_id,count(*) AS rows FROM mobilegis.unit_observations GROUP BY dataset_id').fetchall()
        assert {r['dataset_id']:r['rows'] for r in counts}=={k:1002 for k in db.SOURCES}
        for k in ('lst','ndvi','tvdi'):
            count=conn.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier('mobilegis',k+'_observations'))).fetchone()['n']
            if count!=3006:raise ValueError('Incomplete metric table: '+k)
        conn.execute('INSERT INTO mobilegis.schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING')
        conn.execute((ROOT/'database/migrations/003_analysis_results.sql').read_text(encoding='utf8'))
        conn.execute((ROOT/'database/migrations/004_accounts.sql').read_text(encoding='utf8'))
        from analysis_seed import load
        load(conn)
        return counts

if __name__=='__main__':
    with db.connect() as c:print(json.dumps(import_all(c),ensure_ascii=False))
