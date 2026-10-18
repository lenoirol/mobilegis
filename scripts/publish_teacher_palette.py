"""Recolour display products only. Never change raster values, masks or provenance."""
import sys,json,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
import numpy as np,rasterio
from build_landsat import PALETTES
from build_visual_products import tiles,write_json
from build_landsat import colorize
from rasterio.warp import transform_bounds,reproject
from rasterio.enums import Resampling
from PIL import Image

def publish_fallbacks():
    for year in range(2020,2026):
        for k in PALETTES:
            path=ROOT/'public/data/rasters'/f'{k}_{year}.png'
            with rasterio.open(ROOT/'data/rasters'/f'{k}_{year}_120m.tif') as ds:
                a=ds.read(1,masked=True).astype('float32').filled(np.nan)
                with Image.open(path) as old:width,height=old.size
                bounds=transform_bounds(ds.crs,3857,*ds.bounds)
                transform=rasterio.transform.from_bounds(*bounds,width,height)
                out=np.full((height,width),np.nan,dtype='float32')
                reproject(a,out,src_transform=ds.transform,src_crs=ds.crs,dst_transform=transform,
                          dst_crs=3857,src_nodata=np.nan,dst_nodata=np.nan,resampling=Resampling.nearest)
                Image.fromarray(colorize(out,k)).save(path,optimize=True)
    print('18 fallback display PNGs recoloured; source TIFFs untouched.',flush=True)

def main():
    for source in ('legacy','gee','gee_recovery'):
        years=range(2020,2026) if source!='gee_recovery' else [2025]
        for year in years:
            for k in ('lst','ndvi','tvdi'):
                path=(ROOT/'data/rasters'/f'{k}_{year}_120m.tif' if source=='legacy' else
                      ROOT/'data/gee/rasters'/f'indices_{year}_120m.tif' if source=='gee' else
                      ROOT/'data/gee_recovery/batch1_20261004/indices_2025_recovery_batch1_120m.tif')
                with rasterio.open(path) as ds:
                    band=1 if source=='legacy' else {'ndvi':1,'lst':2,'tvdi':3}[k]
                    arr=ds.read(band,masked=True).astype('float32').filled(np.nan)
                    prefix='' if source=='legacy' else source+'_'
                    key=f'{prefix}{k}_{year}'
                    meta_path=ROOT/'public/data/tiles'/key/'metadata.json'
                    old=json.loads(meta_path.read_text(encoding='utf8')) if meta_path.exists() else None
                    lo,hi,colours=PALETTES[k]
                    meta=tiles(arr,ds.transform,ds.crs,key,lo=lo,hi=hi,colors=colours,force=True)
                    if old and meta!=old:raise ValueError('Recolour changed tile extent/count: '+key)
    write_json(ROOT/'public/data/display_styles.json',{'version':'2026.10.PG3','reference':'Teacher supplied LST-NDVI-TVDI palette',
        'note':'Display endpoints only; physical observations outside display range are preserved; NoData remains transparent.',
        'indices':{k:{'min':lo,'max':hi,'colors':colors} for k,(lo,hi,colors) in PALETTES.items()}})
    print('Teacher palettes published; original numeric TIFFs and masks unchanged.',flush=True)
    publish_fallbacks()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--fallbacks-only',action='store_true');a=p.parse_args()
    publish_fallbacks() if a.fallbacks_only else main()
