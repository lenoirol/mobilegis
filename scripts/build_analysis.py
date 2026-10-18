"""Reproducible pixel statistics from existing TIFFs, no downloads or invented pixels.

Run as database owner after upgrade_analysis.py. Original TIFF/CSV/observations
are immutable. WorldCover 2021 is nearest-neighbour sampled to each 120 m grid.
"""
import argparse,getpass,hashlib,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
import numpy as np
import rasterio
from rasterio.features import geometry_mask,geometry_window
from rasterio.windows import Window
from rasterio.warp import transform_geom,reproject
from rasterio.enums import Resampling
import database as db
from psycopg.types.json import Jsonb
from import_gee import features
from build_visual_products import CLASSES

BANDS={'ndvi':1,'lst':2,'tvdi':3}
BINS={'lst':np.linspace(-80,100,37),'ndvi':np.linspace(-1,1,41),'tvdi':np.linspace(0,1,21)}

def summarize(values,index):
    a=np.asarray(values,dtype='float64');a=a[np.isfinite(a)]
    counts,edges=np.histogram(a,bins=BINS[index])
    h={'edges':edges.tolist(),'counts':counts.tolist(),'scope':'valid pixels, fixed bins across all years'}
    if not len(a):return (0,None,None,None,None,None,None,None,Jsonb(h))
    q25,median,q75=np.quantile(a,[.25,.5,.75])
    return (len(a),float(a.min()),float(a.max()),float(a.mean()),float(median),float(a.std(ddof=0)),float(q25),float(q75),Jsonb(h))

def build(conn):
    units=features()
    from build_landsat import grid_and_units
    legacy_features,legacy_zones,legacy_transform,_=grid_and_units()
    legacy_ids={f['id']:i for i,f in enumerate(legacy_features,1)}
    wcpath=ROOT/'data/gee/rasters/worldcover_2021_10m.tif'
    inserted=0
    for source in db.SOURCES:
        for year in range(2020,2026):
            if source=='gee_recovery' and year<2025:
                for table in ('pixel_statistics','index_landcover_statistics'):
                    cols=[r['column_name'] for r in conn.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='mobilegis' AND table_name=%s ORDER BY ordinal_position",(table,))]
                    selection=','.join("'gee_recovery'" if c=='dataset_id' else c for c in cols)
                    conn.execute(f"INSERT INTO mobilegis.{table} SELECT {selection} FROM mobilegis.{table} WHERE dataset_id='gee' AND year=%s ON CONFLICT DO NOTHING",(year,))
                print(source,year,'same original GEE raster, statistics linked separately',flush=True)
                continue
            paths=([ROOT/'data/rasters'/f'{k}_{year}_120m.tif' for k in BANDS] if source=='legacy' else
                   [ROOT/'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif'] if source=='gee_recovery' else
                   [ROOT/'data/gee/rasters'/f'indices_{year}_120m.tif'])
            with rasterio.open(paths[0]) as ds:
                if source=='legacy':
                    if ds.transform!=legacy_transform or ds.shape!=legacy_zones.shape:raise ValueError('Legacy grid changed.')
                    arrays=[]
                    for p in paths:
                        with rasterio.open(p) as s:
                            a=s.read(1,masked=True).astype('float64').filled(np.nan);arrays.append(a)
                    arrays=np.stack(arrays)
                else:arrays=ds.read(masked=True).astype('float64').filled(np.nan)
                wc=np.zeros(ds.shape,dtype='uint8')
                with rasterio.open(wcpath) as w:
                    reproject(rasterio.band(w,1),wc,src_transform=w.transform,src_crs=w.crs,
                              dst_transform=ds.transform,dst_crs=ds.crs,src_nodata=0,dst_nodata=0,resampling=Resampling.nearest)
                digest=hashlib.sha256(''.join(hashlib.sha256(p.read_bytes()).hexdigest() for p in paths).encode()).hexdigest()
                stat_rows=[];class_rows=[]
                for code,name,geometry in units:
                    geom=transform_geom('EPSG:4326',ds.crs,geometry)
                    win=geometry_window(ds,[geom]).intersection(Window(0,0,ds.width,ds.height))
                    ys,xs=win.toslices();shape=arrays[:,ys,xs].shape[1:]
                    inside=(legacy_zones[ys,xs]==legacy_ids[code] if source=='legacy' else
                            geometry_mask([geom],out_shape=shape,transform=ds.window_transform(win),invert=True))
                    total=int(inside.sum());cover=wc[ys,xs]
                    for k,band in BANDS.items():
                        a=arrays[band-1,ys,xs];values=a[inside]
                        summary=summarize(values,k)
                        stat_rows.append((source,code,year,k,total,*summary,'pixel_centres; stddev_population; linear_quantiles; 120m',digest))
                        for class_code,class_name,_ in CLASSES:
                            vals=a[inside & (cover==class_code) & np.isfinite(a)]
                            if vals.size:class_rows.append((source,code,year,k,class_code,class_name,2021,int(vals.size),float(vals.mean()),'WorldCover2021 nearest-centre classification on index 120m grid'))
                with conn.cursor() as cur:
                    cur.executemany('''INSERT INTO mobilegis.pixel_statistics(dataset_id,code,year,index_name,sample_count,valid_count,minimum,maximum,mean,median,stddev,q25,q75,histogram,method,raster_sha256)
                    VALUES('''+','.join(['%s']*16)+''') ON CONFLICT(dataset_id,code,year,index_name) DO UPDATE SET
                    sample_count=excluded.sample_count,valid_count=excluded.valid_count,minimum=excluded.minimum,maximum=excluded.maximum,
                    mean=excluded.mean,median=excluded.median,stddev=excluded.stddev,q25=excluded.q25,q75=excluded.q75,
                    histogram=excluded.histogram,method=excluded.method,raster_sha256=excluded.raster_sha256''',stat_rows)
                    cur.executemany('INSERT INTO mobilegis.index_landcover_statistics VALUES('+','.join(['%s']*10)+') ON CONFLICT DO NOTHING',class_rows)
                inserted+=len(stat_rows);print(source,year,len(stat_rows),'statistics,',len(class_rows),'class comparisons',flush=True)
    # Verify statistics use exactly the original observation's pixel population.
    for k in BANDS:
        wrong=conn.execute(f'''SELECT count(*) AS n FROM mobilegis.pixel_statistics s
        JOIN mobilegis.{k}_observations m USING(dataset_id,code,year)
        JOIN mobilegis.unit_observations o USING(dataset_id,code,year)
        WHERE s.index_name=%s AND (s.sample_count<>o.sampled_pixels OR s.valid_count<>m.valid_pixels
          OR (m.{k} IS NOT NULL AND abs(s.mean-m.{k})>0.0001))''',(k,)).fetchone()['n']
        if wrong:raise ValueError(f'{k}: {wrong} statistics differ from original counts/means; transaction rolled back.')
    print('All pixel populations and published means verified.',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--user',default='postgres');a=p.parse_args()
    cfg={**db.config(),'user':a.user,'password':os.environ.get('MOBILEGIS_ADMIN_PASSWORD') or getpass.getpass('PostgreSQL admin password: ')}
    with db.psycopg.connect(**cfg,row_factory=db.dict_row) as conn:
        with conn.transaction():
            conn.execute('SELECT pg_advisory_xact_lock(74052025)');build(conn)
