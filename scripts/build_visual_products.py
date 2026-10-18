"""Prepare real contextual layers, mobile XYZ tiles and point-query grids.

Uses existing research outputs without replacing them. ESA WorldCover is fetched
from the publisher's public COG, also catalogued in GEE; no GEE computation claimed.
"""
import sys, json, math, hashlib, time, concurrent.futures
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.transform import from_bounds, array_bounds
from rasterio.windows import from_bounds as window_from_bounds
from PIL import Image
import build_landsat as b

PUBLIC=ROOT/'public/data'; DATA=ROOT/'data'
CLASSES=[(10,'Cây thân gỗ','#006400'),(20,'Cây bụi','#ffbb22'),(30,'Đồng cỏ','#ffff4c'),(40,'Đất trồng trọt','#f096ff'),(50,'Khu xây dựng','#fa0000'),(60,'Đất trống / thực vật thưa','#b4b4b4'),(70,'Băng tuyết','#f0f0f0'),(80,'Mặt nước thường xuyên','#0064c8'),(90,'Đất ngập nước thân thảo','#0096a0'),(95,'Rừng ngập mặn','#00cf75'),(100,'Rêu và địa y','#fae6a0')]
MERCATOR=20037508.342789244

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf8')

def rgba_scalar(arr,lo,hi,colors):
    rgb=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in colors])
    t=np.clip(np.nan_to_num((arr-lo)/(hi-lo),nan=0),0,1)*(len(colors)-1)
    ix=np.minimum(t.astype(int),len(colors)-2)
    value=rgb[ix]*(1-(t-ix))[...,None]+rgb[ix+1]*(t-ix)[...,None]
    return np.dstack([value.astype('uint8'),np.where(np.isfinite(arr),255,0).astype('uint8')])

def tiles(arr,affine,crs,key,style='scalar',lo=0,hi=1,colors=None,force=False):
    bounds=transform_bounds(crs,3857,*array_bounds(*arr.shape[-2:],affine))
    dest=PUBLIC/'tiles'/key
    manifest=dest/'metadata.json'
    if manifest.exists() and not force:return json.loads(manifest.read_text(encoding='utf8'))
    count=0
    for z in range(7,13):
        n=2**z;size=2*MERCATOR/n
        minx=max(0,int((bounds[0]+MERCATOR)/size));maxx=min(n-1,int((bounds[2]+MERCATOR)/size))
        miny=max(0,int((MERCATOR-bounds[3])/size));maxy=min(n-1,int((MERCATOR-bounds[1])/size))
        for x in range(minx,maxx+1):
            for y in range(miny,maxy+1):
                left=-MERCATOR+x*size;top=MERCATOR-y*size
                tx=from_bounds(left,top-size,left+size,top,256,256)
                if style=='rgb':
                    out=np.zeros((4,256,256),dtype='uint8')
                    for c in range(4):reproject(arr[c],out[c],src_transform=affine,src_crs=crs,dst_transform=tx,dst_crs=3857,resampling=Resampling.nearest)
                    rgba=out.transpose(1,2,0)
                elif style=='classes':
                    out=np.zeros((256,256),dtype='uint8')
                    reproject(arr,out,src_transform=affine,src_crs=crs,dst_transform=tx,dst_crs=3857,src_nodata=0,dst_nodata=0,resampling=Resampling.nearest)
                    rgba=np.zeros((256,256,4),dtype='uint8')
                    for code,name,color in CLASSES:rgba[out==code]=[int(color[i:i+2],16) for i in (1,3,5)]+[255]
                else:
                    out=np.full((256,256),np.nan,dtype='float32')
                    reproject(arr,out,src_transform=affine,src_crs=crs,dst_transform=tx,dst_crs=3857,src_nodata=np.nan,dst_nodata=np.nan,resampling=Resampling.nearest)
                    rgba=rgba_scalar(out,lo,hi,colors)
                if not rgba[:,:,3].any():continue
                path=dest/str(z)/str(x)/f'{y}.png';path.parent.mkdir(parents=True,exist_ok=True)
                Image.fromarray(rgba).save(path,optimize=True);count+=1
        print(f'{key}: z{z}, {count} tiles',flush=True)
    w,s,e,n=transform_bounds(3857,4326,*bounds)
    meta={'url':f'/data/tiles/{key}/{{z}}/{{x}}/{{y}}.png','bounds':[[s,w],[n,e]],'min_zoom':7,'max_native_zoom':12,'tiles':count}
    write_json(manifest,meta);return meta

def query_grid(arr,affine,key):
    # Geographical nearest-neighbour display/query grid; explicitly sampled, not native pixel analysis.
    w,s,e,n=transform_bounds(32648,4326,*array_bounds(*arr.shape,affine))
    target=np.full(arr.shape,np.nan,dtype='float32');tx=from_bounds(w,s,e,n,arr.shape[1],arr.shape[0])
    reproject(arr,target,src_transform=affine,src_crs=32648,dst_transform=tx,dst_crs=4326,src_nodata=np.nan,dst_nodata=np.nan,resampling=Resampling.nearest)
    dest=DATA/'query_grid'/f'{key}.bin';dest.parent.mkdir(parents=True,exist_ok=True)
    target.astype('<f4').tofile(dest)
    return {'path':f'{key}.bin','width':arr.shape[1],'height':arr.shape[0],'bounds':[w,s,e,n]}

def contexts(features,zones,affine):
    result={}; out=DATA/'context';out.mkdir(parents=True,exist_ok=True)
    wcpath=out/'worldcover_2021_120m.tif'
    if wcpath.exists():
        with rasterio.open(wcpath) as src:wc=src.read(1)
    else:
        url='https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N09E105_Map.tif'
        wc=np.zeros(zones.shape,dtype='uint8')
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='90',GDAL_HTTP_MAX_RETRY='2'):
            with rasterio.open(url) as src:
                win=window_from_bounds(*transform_bounds(32648,src.crs,*array_bounds(*zones.shape,affine)),transform=src.transform)
                sample=src.read(1,window=win,out_shape=zones.shape,resampling=Resampling.nearest)
                tx=src.window_transform(win)*rasterio.Affine.scale(win.width/zones.shape[1],win.height/zones.shape[0])
                reproject(sample,wc,src_transform=tx,src_crs=src.crs,dst_transform=affine,dst_crs=32648,src_nodata=0,dst_nodata=0,resampling=Resampling.nearest)
        wc[zones==0]=0
        with rasterio.open(wcpath,'w',driver='GTiff',width=wc.shape[1],height=wc.shape[0],count=1,dtype='uint8',crs=32648,transform=affine,nodata=0,compress='deflate') as dst:dst.write(wc,1)
    result['worldcover']={**tiles(wc,affine,32648,'worldcover_2021',style='classes'),'year':2021,'title':'Lớp phủ đất ESA WorldCover 2021','gee_asset':'ESA/WorldCover/v200','source':'https://esa-worldcover.org/en/data-access','catalog':'https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200','license':'CC BY 4.0','download_method':'Public ESA AWS COG; not computed or exported through GEE','source_resolution_m':10,'sample_resolution_m':120,'classes':[{'code':c,'name':n,'color':x} for c,n,x in CLASSES],'sha256':hashlib.sha256(wcpath.read_bytes()).hexdigest()}
    stats=[]
    for i,f in enumerate(features,1):
        vals=wc[zones==i];valid=vals[vals>0]
        stats.append({'code':f['id'],'sampled_pixels':int(vals.size),'valid_pixels':int(valid.size),'coverage':round(valid.size/vals.size,4) if vals.size else 0,'classes':[{'code':c,'name':n,'color':x,'pixels':int((valid==c).sum()),'percent':round(float((valid==c).sum()/valid.size*100),2) if valid.size else 0} for c,n,x in CLASSES]})
    write_json(PUBLIC/'landcover_stats.json',stats)
    for year in [2020,2025]:
        rgbfile=out/f'rgb_{year}_120m.tif'
        if rgbfile.exists():
            with rasterio.open(rgbfile) as src:rgba=src.read()
        else:
            if b.SAS_TOKEN is None:b.SAS_TOKEN=json.loads(b.fetch('https://planetarycomputer.microsoft.com/api/sas/v1/token/landsateuwest/landsat-c2'))['token']
            candidates=json.loads((DATA/'sources/landsat'/f'candidates_{year}.json').read_text(encoding='utf8'))['features']
            ids=[s['id'] for s in json.loads((DATA/'processed'/f'{year}.json').read_text(encoding='utf8'))['scenes']]
            mosaic=np.full((3,*zones.shape),np.nan,dtype='float32')
            for scene in [next(c for c in candidates if c['id']==id) for id in ids]:
                print('RGB source',scene['id'],flush=True)
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:arrays=list(pool.map(lambda k:b.band_on_grid(scene,k,zones,affine),['red','green','blue','qa_pixel','qa_radsat']))
                bands=np.stack(arrays[:3]).astype('float32')*.0000275-.2
                take=(zones>0)&((arrays[3]&63)==0)&(arrays[4]==0)&np.all(np.stack(arrays[:3])>0,axis=0)&~np.isfinite(mosaic[0])
                mosaic[:,take]=bands[:,take]
            rgba=np.concatenate([np.clip(np.nan_to_num(mosaic)/.3,0,1)**(1/1.3)*255,np.where(np.isfinite(mosaic[0]),255,0)[None]],axis=0).astype('uint8')
            with rasterio.open(rgbfile,'w',driver='GTiff',width=zones.shape[1],height=zones.shape[0],count=4,dtype='uint8',crs=32648,transform=affine,compress='deflate') as dst:dst.write(rgba)
        result['rgb_'+str(year)]={**tiles(rgba,affine,32648,f'rgb_{year}',style='rgb'),'year':year,'title':f'Landsat màu tự nhiên {year}','dates':[s['datetime'][:10] for s in json.loads((DATA/'processed'/f'{year}.json').read_text(encoding='utf8'))['scenes']],'sample_resolution_m':120,'source':'USGS Landsat C2 L2 through Microsoft Planetary Computer','method':'QA-masked first-valid low-cloud mosaic; reflectance stretch 0–0.3, gamma 1.3; not live satellite imagery'}
    return result

def main():
    features,zones,affine,bbox=b.grid_and_units()
    product={'version':'2026.10','generated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'absolute':{},'change':{},'query':{},'context':{},'no_data':'Never fill missing samples with zero or fabricated values.'}
    product['context']=contexts(features,zones,affine)
    for year in range(2020,2026):
        product['absolute'][str(year)]={}
        for key,(lo,hi,colors) in b.PALETTES.items():
            with rasterio.open(DATA/'rasters'/f'{key}_{year}_120m.tif') as src:arr=src.read(1);arr[arr==src.nodata]=np.nan
            product['absolute'][str(year)][key]=tiles(arr,affine,32648,f'{key}_{year}',lo=lo,hi=hi,colors=colors)
            product['query'][f'{key}_{year}']=query_grid(arr,affine,f'{key}_{year}')
    for key,limit in [('lst',10),('ndvi',.3),('tvdi',.4)]:
        arrays=[]
        for year in [2020,2025]:
            with rasterio.open(DATA/'rasters'/f'{key}_{year}_120m.tif') as src:arr=src.read(1);arr[arr==src.nodata]=np.nan;arrays.append(arr)
        delta=arrays[1]-arrays[0]
        change_path=DATA/'rasters'/f'change_{key}_2020_2025_120m.tif'
        with rasterio.open(change_path,'w',driver='GTiff',width=delta.shape[1],height=delta.shape[0],count=1,dtype='float32',crs=32648,transform=affine,nodata=-9999,compress='deflate') as dst:
            dst.write(np.where(np.isfinite(delta),delta,-9999).astype('float32'),1)
        product['change'][key]={**tiles(delta,affine,32648,f'change_{key}_2020_2025',lo=-limit,hi=limit,colors=['#2171b5','#f7f7f7','#c53a32']),'from':2020,'to':2025,'min':-limit,'max':limit,'valid_pairs':int(np.isfinite(delta).sum()),'note':'Only co-located valid samples in both years; acquisition dates differ. TVDI edges fitted independently.'}
        product['query'][f'change_{key}']=query_grid(delta,affine,f'change_{key}')
    write_json(PUBLIC/'visual_products.json',product)
    write_json(DATA/'query_grid/metadata.json',product['query'])
    print('Visual products published',flush=True)

if __name__=='__main__':main()
