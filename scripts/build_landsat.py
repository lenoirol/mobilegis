"""Reproducible, coarse-resolution Landsat research preview, not validated final science.

Downloads sampled COG bands for a fixed Jan-Apr seasonal window; retains unsigned
STAC records and sampled inputs. Never fills clouds or missing years with synthetic data.
"""
import argparse
import concurrent.futures
import csv
import hashlib
import json
import math
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin, array_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, transform as transform_geometry
from shapely import make_valid
from pyproj import Transformer
from PIL import Image
from download_boundaries import fetch

STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
KEYS = ['red', 'nir08', 'lwir11', 'qa_pixel', 'qa_radsat']
DATA = ROOT / 'data'
PUBLIC = ROOT / 'public' / 'data'
RESOLUTION = 120
SAS_TOKEN = None
PALETTES = {'lst': (20,45,['#0000FF','#0066FF','#00FFFF','#00FF00','#FFFF00','#FFCC00','#FF6600','#FF0000']),
            'ndvi': (-.2,1,['#FF0000','#FF7F00','#FFFF00','#ADFF2F','#00FF00','#00FFFF','#007FFF','#0000FF']),
            'tvdi': (0,1,['#066b00','#0bc400','#0ce100','#00ff00','#ffff00','#ffcc00','#ff6600','#ff0000'])}

def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')

def grid_and_units():
    features = json.loads((PUBLIC / 'hcm_167.geojson').read_text(encoding='utf-8'))['features']
    # Analysis uses original geometries, never simplified display polygons.
    originals = {}
    for p in (DATA / 'sources' / 'boundaries').glob('*.geojson'):
        f = json.loads(p.read_text(encoding='utf-8'))['features'][0]
        originals[f['properties']['code']] = make_valid(shape(f['geometry']))
    if not originals:
        seed=ROOT/'database/seeds/boundaries_original.geojson'
        for f in json.loads(seed.read_text(encoding='utf8'))['features']:
            originals[str(f['id'])]=make_valid(shape(f['geometry']))
    projector = Transformer.from_crs(4326, 32648, always_xy=True).transform
    shapes = [(transform_geometry(projector, originals[f['id']]), i+1) for i,f in enumerate(features)]
    union = unary_union([g for g,_ in shapes])
    left,bottom,right,top = union.bounds
    left,bottom = math.floor(left/RESOLUTION)*RESOLUTION, math.floor(bottom/RESOLUTION)*RESOLUTION
    right,top = math.ceil(right/RESOLUTION)*RESOLUTION, math.ceil(top/RESOLUTION)*RESOLUTION
    width,height = int((right-left)/RESOLUTION),int((top-bottom)/RESOLUTION)
    affine = from_origin(left,top,RESOLUTION,RESOLUTION)
    zones = rasterize(shapes, out_shape=(height,width), transform=affine, fill=0, dtype='uint16')
    return features,zones,affine,transform_bounds(32648,4326,left,bottom,right,top)

def search(year, bbox):
    dest = DATA / 'sources' / 'landsat' / f'candidates_{year}.json'
    if dest.exists():
        return json.loads(dest.read_text(encoding='utf-8'))['features']
    params = {'collections':'landsat-c2-l2','bbox':','.join(map(str,bbox)),
              'datetime':f'{year}-01-01T00:00:00Z/{year}-04-30T23:59:59Z','limit':100}
    url = STAC+'/search?'+urllib.parse.urlencode(params)
    found = []
    while url:
        page = json.loads(fetch(url))
        found.extend(page['features'])
        url = next((l['href'] for l in page.get('links',[]) if l['rel']=='next'),None)
    save_json(dest, {'type':'FeatureCollection','features':found})
    return found

def select_scenes(items):
    # One low-cloud acquisition per WRS path/row; dates are retained, not called annual means.
    groups = {}
    for item in items:
        p = item['properties']
        if p.get('platform') not in ('landsat-8','landsat-9') or 'lwir11' not in item['assets']:
            continue
        if p.get('landsat:correction') != 'L2SP' or p.get('eo:cloud_cover',100)>35:
            continue
        key = (str(p.get('landsat:wrs_path')),str(p.get('landsat:wrs_row')))
        if key not in groups or p['eo:cloud_cover']<groups[key]['properties']['eo:cloud_cover']:
            groups[key] = item
    return sorted(groups.values(), key=lambda i:i['properties']['eo:cloud_cover'])

def band_on_grid(item, key, zones, affine):
    cache = DATA/'sampled_inputs'/item['id']/f'{key}.npy'
    if cache.exists():
        return np.load(cache)
    url = item['assets'][key]['href']
    signed = url + '?' + SAS_TOKEN
    bounds = array_bounds(*zones.shape, affine)
    # Source bands are sampled to a common 120 m grid with nearest neighbour.
    # QA is applied on this coarse grid: not a native-30m cloud-mask guarantee.
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='90',
                      GDAL_HTTP_MAX_RETRY='3', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.TIF'):
        with rasterio.open(signed) as src:
            source_bounds = transform_bounds(32648,src.crs,*bounds)
            win = from_bounds(*source_bounds,transform=src.transform)
            win = win.intersection(rasterio.windows.Window(0,0,src.width,src.height))
            h,w = max(1,math.ceil(win.height/4)),max(1,math.ceil(win.width/4))
            raw = src.read(1,window=win,out_shape=(h,w),resampling=Resampling.nearest)
            src_transform = src.window_transform(win)*rasterio.Affine.scale(win.width/w,win.height/h)
            result = np.zeros(zones.shape,dtype='uint16')
            reproject(raw,result,src_transform=src_transform,src_crs=src.crs,
                      dst_transform=affine,dst_crs='EPSG:32648',src_nodata=0,dst_nodata=0,
                      resampling=Resampling.nearest)
    cache.parent.mkdir(parents=True,exist_ok=True)
    np.save(cache,result)
    return result

def indices(red_dn,nir_dn,temp_dn,qa,saturation):
    red = red_dn.astype('float32')*.0000275-.2
    nir = nir_dn.astype('float32')*.0000275-.2
    common = ((qa & 63)==0) & (saturation==0) & (red_dn>0) & (nir_dn>0)
    common &= (red>=0) & (red<=1) & (nir>=0) & (nir<=1) & ((red+nir)>0)
    ndvi = np.full(red.shape,np.nan,dtype='float32')
    np.divide(nir-red,nir+red,out=ndvi,where=common)
    lst = temp_dn.astype('float32')*.00341802+149-273.15
    lst[~common | (temp_dn==0) | (lst < -10) | (lst > 70)] = np.nan
    return ndvi,lst,((qa & 128)>0)

def fit_tvdi(ndvi,lst,land):
    valid = land & np.isfinite(ndvi) & np.isfinite(lst) & (ndvi>=.1) & (ndvi<=.85)
    bins=[]
    for low in np.arange(.1,.85,.05):
        mask = valid & (ndvi>=low) & (ndvi<low+.05)
        if mask.sum() >= 80:
            bins.append([float(np.mean(ndvi[mask])),float(np.percentile(lst[mask],5)),float(np.percentile(lst[mask],95)),int(mask.sum())])
    out = np.full(ndvi.shape,np.nan,dtype='float32')
    if len(bins)<6:
        return out, {'status':'insufficient_bins','bins':bins}
    b = np.array(bins)
    wet = np.polyfit(b[:,0],b[:,1],1)
    dry = np.polyfit(b[:,0],b[:,2],1)
    span = np.polyval(dry,ndvi)-np.polyval(wet,ndvi)
    valid &= (ndvi>=b[:,0].min()) & (ndvi<=b[:,0].max()) & (span>2)
    raw = np.full(ndvi.shape,np.nan,dtype='float32')
    np.divide(lst-np.polyval(wet,ndvi),span,out=raw,where=valid)
    out[valid] = np.clip(raw[valid],0,1)
    return out, {'status':'experimental','wet_slope_intercept':wet.tolist(),
                 'dry_slope_intercept':dry.tolist(),'bins':bins,
                 'clipped_fraction':float(np.mean((raw[valid]<0)|(raw[valid]>1))) if valid.any() else None,
                 'ndvi_domain':[float(b[:,0].min()),float(b[:,0].max())],
                 'note':'Per-scene 5th/95th percentile linear edges; requires independent scientific validation.'}

def colorize(arr,key):
    lo,hi,hexes=PALETTES[key]
    colors=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in hexes])
    t=np.clip(np.nan_to_num((arr-lo)/(hi-lo),nan=0),0,1)*(len(hexes)-1)
    lower=np.minimum(t.astype(int),len(hexes)-2)
    rgb=colors[lower]*(1-(t-lower))[...,None]+colors[lower+1]*(t-lower)[...,None]
    return np.dstack([rgb.astype('uint8'),np.where(np.isfinite(arr),210,0).astype('uint8')])

def write_raster(arr,key,year,affine):
    dest=DATA/'rasters'/f'{key}_{year}_120m.tif'
    dest.parent.mkdir(parents=True,exist_ok=True)
    profile={'driver':'GTiff','height':arr.shape[0],'width':arr.shape[1],'count':1,
             'dtype':'float32','crs':'EPSG:32648','transform':affine,'nodata':-9999,
             'compress':'deflate','tiled':True}
    with rasterio.open(dest,'w',**profile) as dst:
        dst.write(np.nan_to_num(arr,nan=-9999),1)
        dst.set_band_description(1,key.upper()+' seasonal preview')
    left,bottom,right,top=transform_bounds(32648,3857,*array_bounds(*arr.shape,affine))
    width,height=arr.shape[1],arr.shape[0]
    display_transform=rasterio.transform.from_bounds(left,bottom,right,top,width,height)
    display=np.full(arr.shape,np.nan,dtype='float32')
    reproject(arr,display,src_transform=affine,src_crs=32648,dst_transform=display_transform,
              dst_crs=3857,src_nodata=np.nan,dst_nodata=np.nan,resampling=Resampling.nearest)
    png=PUBLIC/'rasters'/f'{key}_{year}.png'
    png.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(colorize(display,key)).save(png,optimize=True)
    w,s,e,n=transform_bounds(3857,4326,left,bottom,right,top)
    return {'image':f'/data/rasters/{key}_{year}.png','bounds':[[s,w],[n,e]],
            'geotiff':f'/api/rasters/{key}_{year}_120m.tif','min':PALETTES[key][0],
            'max':PALETTES[key][1],'valid_pixels':int(np.isfinite(arr).sum())}

def process_year(year,features,zones,affine,bbox):
    items=select_scenes(search(year,bbox))
    if not items:
        raise ValueError(f'No suitable L2SP scenes for {year}; do not publish an empty product.')
    print(f'{year}: selected {len(items)} scenes',flush=True)
    mosaics={k:np.full(zones.shape,np.nan,dtype='float32') for k in PALETTES}
    scene_map=np.zeros(zones.shape,dtype='uint8')
    scenes=[]
    for i,item in enumerate(items):
        print(f"  {item['id']} cloud={item['properties']['eo:cloud_cover']}",flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            arrays=list(pool.map(lambda k:band_on_grid(item,k,zones,affine),KEYS))
        ndvi,lst,water=indices(*arrays)
        ndvi[zones==0]=np.nan
        lst[zones==0]=np.nan
        tvdi,fit=fit_tvdi(ndvi,lst,(zones>0)&~water)
        # Preserve a common source scene for LST/NDVI. TVDI stays missing when invalid.
        take=(zones>0)&np.isfinite(ndvi)&np.isfinite(lst)&~np.isfinite(mosaics['lst'])
        for k,a in [('lst',lst),('ndvi',ndvi),('tvdi',tvdi)]:
            mosaics[k][take]=a[take]
        scene_map[take]=i+1
        scenes.append({'id':item['id'],'datetime':item['properties']['datetime'],
                       'cloud_cover':item['properties']['eo:cloud_cover'],
                       'platform':item['properties']['platform'],'pixels_used':int(take.sum()),
                       'assets':{k:item['assets'][k]['href'] for k in KEYS},'tvdi_fit':fit})
    layers={k:write_raster(a,k,year,affine) for k,a in mosaics.items()}
    rows=[]
    for j,f in enumerate(features):
        mask=zones==j+1
        total=int(mask.sum())
        row={'code':f['id'],'name':f['properties']['full_name'],'year':year,'sampled_pixels':total}
        for k,a in mosaics.items():
            values=a[mask & np.isfinite(a)]
            row[k+'_pixels']=int(values.size)
            row[k+'_coverage']=round(values.size/total,4) if total else 0
            row[k]=round(float(values.mean()),4) if values.size>=5 and row[k+'_coverage']>=.1 else None
        source_ids=sorted(set(int(v) for v in scene_map[mask] if v))
        row['scene_ids']=[items[n-1]['id'] for n in source_ids]
        row['dates']=[items[n-1]['properties']['datetime'][:10] for n in source_ids]
        rows.append(row)
    result={'year':year,'layers':layers,'scenes':scenes,'rows':rows}
    save_json(DATA/'processed'/f'{year}.json',result)
    return result

def publish():
    results=[json.loads(p.read_text(encoding='utf-8')) for p in sorted((DATA/'processed').glob('*.json'))]
    results=[r for r in results if r.get('scenes')]
    rows=[r for d in results for r in d['rows']]
    manifest={'title':'Landsat 8/9 Collection 2 Level-2 — bản xử lý thử nghiệm',
              'generated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
              'resolution_m':120,'crs':'EPSG:32648','season':'January-April',
              'aggregation':'Low-cloud per-path-row mosaic; not annual average or same-date imagery.',
              'boundary_reference':'2025 units, applied consistently to 2020–2025; not historical boundaries.',
              'limitations':['Coarse 120 m nearest-neighbour sample; not full 30 m analysis.',
                            'QA checked on sampled grid; small clouds may be missed.',
                            'TVDI estimated per scene and not independently validated.',
                            'Zonal means represent valid sampled pixels, not all land in each unit.',
                            'Missing values remain null; no synthetic filling.'],
              'years':[{'year':d['year'],'layers':d['layers'],'scenes':d['scenes']} for d in results]}
    save_json(PUBLIC/'observations_real.json',rows)
    save_json(PUBLIC/'landsat_manifest.json',manifest)
    export=PUBLIC/'observations_real.csv'
    if rows:
        with export.open('w',encoding='utf-8-sig',newline='') as fh:
            writer=csv.DictWriter(fh,fieldnames=list(rows[0]))
            writer.writeheader()
            for row in rows:
                writer.writerow({k:';'.join(v) if isinstance(v,list) else v for k,v in row.items()})
    print(f'Published {len(results)} years, {len(rows)} unit/year records',flush=True)

def main():
    global SAS_TOKEN
    parser=argparse.ArgumentParser()
    parser.add_argument('--years',nargs='+',type=int,default=list(range(2020,2026)))
    parser.add_argument('--publish-only',action='store_true')
    args=parser.parse_args()
    if not args.publish_only:
        SAS_TOKEN = json.loads(fetch('https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2'))['token']
        features,zones,affine,bbox=grid_and_units()
        print(f'Grid {zones.shape} at {RESOLUTION}m; bounds {bbox}',flush=True)
        for year in args.years:
            cached = DATA/'processed'/f'{year}.json'
            if not cached.exists() or not json.loads(cached.read_text(encoding='utf-8')).get('scenes'):
                process_year(year,features,zones,affine,bbox)
            publish()
    else:
        publish()

if __name__=='__main__':
    main()
