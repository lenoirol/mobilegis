"""Validate user-supplied point time series without altering research/demo data."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
from shapely.geometry import shape, Point

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('csv_path',type=Path)
    args=parser.parse_args()
    raw=args.csv_path.read_bytes()
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    required={'name','lat','lon','year','lst','ndvi','tvdi','source'}
    if not required.issubset(reader.fieldnames or []):raise ValueError('CSV thiếu cột bắt buộc')
    features=[]
    for p in (ROOT/'data/sources/boundaries').glob('*.geojson'):
        f=json.loads(p.read_text(encoding='utf-8'))['features'][0]
        if f['properties']['code']!='26732':features.append((f,shape(f['geometry'])))
    names={'Trung tam TP.HCM':'Trung tâm TP.HCM','Thu Duc':'Thủ Đức','Can Gio':'Cần Giờ','Cu Chi':'Củ Chi'}
    rows=[];seen=set(); coords={}
    for line,r in enumerate(reader,2):
        row={k:float(r[k]) for k in ('lat','lon','year','lst','ndvi','tvdi')}
        if not all(math.isfinite(v) for v in row.values()):raise ValueError(f'Dòng {line}: số không hữu hạn')
        if row['year']!=int(row['year']) or not 2020<=row['year']<=2025:raise ValueError(f'Dòng {line}: năm không hợp lệ')
        for k,lo,hi in [('lat',-90,90),('lon',-180,180),('lst',-80,100),('ndvi',-1,1),('tvdi',0,1)]:
            if not lo<=row[k]<=hi:raise ValueError(f'Dòng {line}: {k} ngoài miền giá trị')
        if not r['name'].strip() or not r['source'].strip():raise ValueError(f'Dòng {line}: thiếu tên hoặc nguồn')
        row['year']=int(row['year'])
        row.update(name=names.get(r['name'],r['name']),original_name=r['name'],source=r['source'],dataset='user_csv')
        unique=(row['name'],row['year'])
        if unique in seen:raise ValueError(f'Dòng {line}: trùng điểm và năm')
        seen.add(unique)
        pair=(row['lat'],row['lon'])
        if row['name'] in coords and coords[row['name']]!=pair:raise ValueError(f'Dòng {line}: điểm đổi tọa độ giữa các năm')
        coords[row['name']]=pair
        point=Point(row['lon'],row['lat'])
        matches=[f['properties'] for f,g in features if g.covers(point)]
        row['containing_units']=[{'code':p['code'],'name':p['fullName']} for p in matches]
        row['method_status']='user_provided_not_reproduced'
        rows.append(row)
    if not rows:raise ValueError('CSV rỗng')
    rows.sort(key=lambda r:(r['name'],r['year']))
    out=ROOT/'public/data'
    # Exact original bytes retained for download and provenance.
    (out/'user_supplied_original.csv').write_bytes(raw)
    (out/'observations_user.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    report={'filename':args.csv_path.name,'sha256':hashlib.sha256(raw).hexdigest(),
            'rows':len(rows),'points':len(coords),'years':sorted({r['year'] for r in rows}),
            'all_points_have_six_years':all(len([r for r in rows if r['name']==name])==6 for name in coords),
            'ranges':{k:[min(r[k] for r in rows),max(r[k] for r in rows)] for k in ('lst','ndvi','tvdi')},
            'tvdi_equal_one':sum(r['tvdi']==1 for r in rows),
            'point_locations':[{'name':name,'lat':lat,'lon':lon,'units':next(r['containing_units'] for r in rows if r['name']==name)} for name,(lat,lon) in coords.items()],
            'source_claim':'GEE Landsat 8/9 Collection 2 Level 2, mùa khô; as stated in supplied CSV',
            'missing_method_metadata':['GEE script / export task','scene IDs and acquisition dates','seasonal aggregation and cloud mask','point vs buffer sampling and buffer radius','TVDI wet/dry edge method'],
            'interpretation':'Point-labelled series; no assumption of ward mean or independent ground truth. Values preserved exactly; display names and integer years normalized.'}
    (out/'user_csv_source.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
