"""MobileGIS PG3: FastAPI + PostGIS, observed data and separate analytical results."""
import argparse,base64,csv,io,math,socket,struct,sys,uuid
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr,'reconfigure'):sys.stderr.reconfigure(encoding='utf-8')
from contextlib import asynccontextmanager
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
if (ROOT.parent/'.pg-libs').is_dir():sys.path.insert(0,str(ROOT.parent/'.pg-libs'))
import database as db
import analysis
from auth_api import router as auth_router,require_admin_write
from http_utils import read_json
import psycopg
from fastapi import FastAPI,Request,HTTPException,Query,Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse,Response,FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
import uvicorn
VERSION='2026.10.PG4 · Tài khoản / Hiện trạng / Thống kê / Giả lập · PostGIS'
TILE_KEYS={f'{p}{k}_{y}' for p in ('','gee_') for k in ('lst','ndvi','tvdi') for y in range(2020,2026)}
TILE_KEYS|={'worldcover_2021','gee_worldcover_2021','rgb_2020','rgb_2025'}
TILE_KEYS|={f'{p}change_{k}_2020_2025' for p in ('','gee_','gee_recovery_') for k in ('lst','ndvi','tvdi')}
TILE_KEYS|={f'gee_recovery_{k}_2025' for k in ('lst','ndvi','tvdi')}
DOCUMENTS={'quickstart.md':('DATABASE_POSTGRESQL.md','text/markdown'),'gee_guide.md':('GEE_README.md','text/markdown'),
 'gee_script.js':('scripts/gee_mobilegis.js','text/javascript'),'gee_next_years.md':('GEE_2020_2024.md','text/markdown'),
 'hcm167_GEE.zip':('data/gee_boundary/hcm167_GEE.zip','application/zip'),
 'database_design.md':('database/DESIGN.md','text/markdown'),'schema.sql':('database/schema.sql','text/plain'),
 'pg3_guide.md':('NANG_CAP_PG3_20261011.md','text/markdown')}
DB_DOCUMENTS={'landsat_manifest.json','boundary_source.json','user_csv_source.json','visual_products.json','gee/products.json','gee_recovery/products.json'}

@asynccontextmanager
async def lifespan(app):
    db.health()
    yield
app=FastAPI(title='MobileGIS TP.HCM',version='2026.10.PG4',lifespan=lifespan,
 description='PostGIS ranh giới và thống kê có nguồn; TIFF/XYZ lưu riêng. TVDI thử nghiệm.')
app.include_router(auth_router)
@app.exception_handler(psycopg.OperationalError)
def db_error(request,exc):return JSONResponse({'error':'Không kết nối được PostgreSQL. Kiểm tra CSDL; không tự chuyển sang dữ liệu cũ.'},503)
@app.exception_handler(psycopg.IntegrityError)
def constraint_error(request,exc):return JSONResponse({'error':'Vi phạm ràng buộc CSDL; kiểm tra tên/năm trùng hoặc giá trị ngoài phạm vi.'},400)
@app.exception_handler(HTTPException)
def http_error(request,exc):return JSONResponse({'error':exc.detail},exc.status_code)
@app.exception_handler(RequestValidationError)
def input_error(request,exc):return JSONResponse({'error':'Tham số không hợp lệ; kiểm tra tọa độ hữu hạn, năm, độ phủ và chỉ số.'},400)
def attachment(path,mime=None):
    if not path.is_file():raise HTTPException(404,'Chưa có file này.')
    return FileResponse(path,media_type=mime,filename=path.name)
def validate(o):
    name=str(o.get('name','')).strip();source=str(o.get('source','')).strip()
    if not name or len(name)>150 or not source or len(source)>500:raise ValueError('Cần tên và nguồn hợp lệ.')
    lat,lon,year,lst,ndvi,tvdi=[float(o[k]) for k in ('lat','lon','year','lst','ndvi','tvdi')]
    if not all(math.isfinite(v) for v in (lat,lon,year,lst,ndvi,tvdi)):raise ValueError('Giá trị phải hữu hạn.')
    if not (-90<=lat<=90 and -180<=lon<=180 and 2020<=year<=2025 and year==int(year) and -80<=lst<=100 and -1<=ndvi<=1 and 0<=tvdi<=1):raise ValueError('Kiểm tra tọa độ, năm 2020–2025 và khoảng LST/NDVI/TVDI.')
    return name,lat,lon,int(year),lst,ndvi,tvdi,source
@app.get('/api/info')
def info(request:Request):return {'version':VERSION,'project':str(ROOT),'port':request.url.port,'database':db.health(),'architecture':'PostGIS + local raster storage → FastAPI REST/XYZ → WebGIS/PWA'}
@app.get('/api/health')
def health():return {'status':'ok',**db.health()}
@app.get('/api/observations')
def demo():return db.demo()
@app.get('/api/export')
def demo_export():return Response(db.csv_text(db.demo()),media_type='text/csv',headers={'Content-Disposition':'attachment; filename=mobilegis_demo_postgres.csv'})
@app.get('/api/research/observations')
def research(source:str='gee_recovery',year:int|None=Query(None,ge=1900,le=2200),code:str|None=None,index:str|None=None,coverage:float=Query(0,ge=0,le=1)):
    try:return db.observations(source,year,code,index,coverage)
    except ValueError as e:raise HTTPException(400,str(e))
@app.get('/api/units')
def units(lat:float|None=Query(None,ge=-90,le=90),lon:float|None=Query(None,ge=-180,le=180),detail:str='display'):
    if (lat is None)!=(lon is None):raise HTTPException(400,'Cần cả lat và lon.')
    if detail not in ('display','original'):raise HTTPException(400,'Detail phải là display hoặc original.')
    return db.boundaries(lat,lon,original=detail=='original')
@app.get('/api/research/indices/{index}')
def metric(index:str,source:str='gee_recovery',year:int|None=Query(None,ge=1900,le=2200),code:str|None=None,coverage:float=Query(0,ge=0,le=1)):
    try:return db.metric_observations(index,source,year,code,coverage)
    except ValueError as e:raise HTTPException(400,str(e))
@app.get('/api/research/alerts')
def alerts(source:str='gee_recovery',year:int=Query(2025,ge=2020,le=2025),threshold:float=Query(.8,ge=0,le=1),coverage:float=Query(.5,ge=.1,le=1)):
    try:rows=db.observations(source,year,index='tvdi',coverage=coverage)
    except ValueError as e:raise HTTPException(400,str(e))
    return {'status':'experimental_screening_not_official_warning','source':source,'year':year,'threshold':threshold,'minimum_coverage':coverage,
     'message':'Sàng lọc trung bình TVDI cao theo ngưỡng; không phải cấp hạn hoặc cảnh báo đã kiểm định.',
     'units':sorted([r for r in rows if r['tvdi']>=threshold],key=lambda r:-r['tvdi'])}
@app.get('/api/analysis/statistics')
def statistics(source:str='gee_recovery',year:int=Query(2025,ge=1900,le=2200),index:str='lst',coverage:float=Query(.5,ge=0,le=1),code:str|None=None):
    try:return analysis.statistics(source,year,index,coverage,code)
    except ValueError as e:raise HTTPException(400,str(e))
@app.get('/api/analysis/landcover')
def analysis_cover(source:str='gee_recovery',year:int=Query(2025,ge=1900,le=2200),index:str='lst',coverage:float=Query(.5,ge=0,le=1),code:str|None=None):
    try:return analysis.landcover(source,year,index,coverage,code)
    except ValueError as e:raise HTTPException(400,str(e))
@app.get('/api/analysis/correlations')
def correlations(source:str='gee_recovery',year:int=Query(2025,ge=1900,le=2200),coverage:float=Query(.5,ge=0,le=1)):
    try:return analysis.correlations(source,year,coverage)
    except ValueError as e:raise HTTPException(400,str(e))
@app.get('/api/analysis/runs')
def analysis_runs():return analysis.runs()
@app.get('/api/analysis/runs/{run_id}')
def analysis_result(run_id:str):
    try:return analysis.results(uuid.UUID(run_id))
    except ValueError as e:raise HTTPException(400,str(e))
@app.post('/api/analysis/simulate')
async def simulate(request:Request,admin=Depends(require_admin_write)):
    data=await read_json(request,10000,'Kịch bản quá lớn.')
    try:return await run_in_threadpool(analysis.simulate,data)
    except (ValueError,TypeError,OverflowError) as e:raise HTTPException(400,str(e))
@app.post('/api/{action}')
async def modify_demo(action:str,request:Request,admin=Depends(require_admin_write)):
    if action not in ('save','delete','import'):raise HTTPException(404,'Không có chức năng ghi này.')
    o=await read_json(request,2_000_000,'Dữ liệu vượt giới hạn 2 MB.')
    try:
        if action=='save':await run_in_threadpool(db.demo_save,validate(o),o.get('id'))
        elif action=='delete':await run_in_threadpool(db.demo_delete,o['id'])
        else:
            rows=list(csv.DictReader(io.StringIO(o['csv'].lstrip('\ufeff'))))
            if not 0<len(rows)<=5000:raise ValueError('CSV cần từ 1 đến 5000 dòng.')
            await run_in_threadpool(db.demo_import,[validate(r) for r in rows])
        return {'ok':True}
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(400,str(e))
@app.get('/api/sample')
def sample(lat:float=Query(ge=-90,le=90),lon:float=Query(ge=-180,le=180),year:int=Query(ge=2020,le=2025),index:str='lst',source:str='legacy',change:int=0):
    if source not in db.SOURCES or index not in ('lst','ndvi','tvdi') or change not in (0,1):raise HTTPException(400,'Tham số không hợp lệ.')
    name='change_'+index if change else f'{index}_{year}'
    metadata=db.document('data/query_grid/metadata.json') if source=='legacy' else db.document(f'public/data/{source}/products.json')['query']
    if name not in metadata:return {'value':None,'status':'unavailable','source':source,'year':year}
    meta=metadata[name];w,s,e,n=meta['bounds'];value=None
    if w<=lon<e and s<lat<=n:
        x=int((lon-w)/(e-w)*meta['width']);y=int((n-lat)/(n-s)*meta['height'])
        target=(ROOT/'data/query_grid'/meta['path']).resolve()
        if not target.is_relative_to((ROOT/'data/query_grid').resolve()):raise HTTPException(500,'Đường dẫn lưới không hợp lệ.')
        with target.open('rb') as f:f.seek((y*meta['width']+x)*4);value=struct.unpack('<f',f.read(4))[0]
        if not math.isfinite(value):value=None
    return {'value':value,'lat':lat,'lon':lon,'year':year,'index':index,'source':source,'resolution_m':120,'method':'Nearest geographical query sample resampled from the selected 120 m research grid','change':bool(change)}
@app.get('/api/documents/{name}')
def documents(name:str):
    if name not in DOCUMENTS:raise HTTPException(404,'Không có tài liệu này.')
    if name=='schema.sql':
        content='\n'.join(p.read_text(encoding='utf8') for p in [ROOT/'database/schema.sql',*sorted((ROOT/'database/migrations').glob('*.sql'))])
        return Response(content,media_type='text/plain',headers={'Content-Disposition':'attachment; filename=mobilegis_schema_pg3.sql'})
    path,mime=DOCUMENTS[name];return attachment(ROOT/path,mime)
@app.get('/api/{source}/{kind}/{name}')
def gee_file(source:str,kind:str,name:str):
    if source=='gee':
        originals={f'MobileGIS_{k}_{y}'+('_120m.tif' if k=='indices' else '_120m.csv' if k=='units' else '.csv') for k in ('indices','units','scenes') for y in range(2020,2026)}|{'MobileGIS_WorldCover_2021_10m.tif'}
        rasters={f'indices_{y}_120m.tif' for y in range(2020,2026)}|{'worldcover_2021_10m.tif'}|{f'change_{k}_2020_2025_120m.tif' for k in ('lst','ndvi','tvdi')}
        folder=ROOT/'data/gee'/kind
    elif source=='gee_recovery':
        originals={f'MobileGIS_recovery_2025_batch1_{s}' for s in ('120m.tif','scenes.csv','diagnostics.csv')}
        rasters={'indices_2025_recovery_batch1_120m.tif','provenance_2025_120m.tif'}|{f'change_{k}_2020_2025_120m.tif' for k in ('lst','ndvi','tvdi')}
        folder=ROOT/'data/gee_recovery/batch1_20261004'/('originals' if kind=='originals' else '')
    else:raise HTTPException(404,'Nguồn không hợp lệ.')
    if kind not in ('originals','rasters') or name not in (originals if kind=='originals' else rasters):raise HTTPException(404,'File không hợp lệ.')
    return attachment(folder/name,'image/tiff' if name.endswith('.tif') else 'text/csv')
@app.get('/api/rasters/{name}')
def legacy_file(name:str):
    allowed={f'{k}_{y}_120m.tif' for k in ('lst','ndvi','tvdi') for y in range(2020,2026)}|{f'change_{k}_2020_2025_120m.tif' for k in ('lst','ndvi','tvdi')}|{'worldcover_2021_120m.tif','rgb_2020_120m.tif','rgb_2025_120m.tif'}
    if name not in allowed:raise HTTPException(404,'Không có raster này.')
    return attachment(ROOT/'data'/('context' if name.startswith(('worldcover','rgb_')) else 'rasters')/name,'image/tiff')
@app.get('/data/tiles/{layer}/{z}/{x}/{y}.png')
def tile(layer:str,z:int,x:int,y:int):
    if layer not in TILE_KEYS or not (0<=z<=18 and 0<=x<2**z and 0<=y<2**z):raise HTTPException(404,'Tile không hợp lệ.')
    target=ROOT/f'public/data/tiles/{layer}/{z}/{x}/{y}.png'
    if target.exists():return FileResponse(target,media_type='image/png')
    return Response(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+XwV7AAAAAElFTkSuQmCC'),media_type='image/png')
@app.get('/data/{name:path}')
def data_compatibility(name:str):
    if name=='hcm_167.geojson':return db.boundaries()
    if name=='observations_user.json':return db.points()
    if name in ('observations_real.json','observations_real.csv'):rows=db.observations('legacy')
    elif name in ('gee/observations.json','gee/observations.csv'):rows=db.observations('gee')
    elif name in ('gee_recovery/observations.json','gee_recovery/observations.csv'):rows=db.observations('gee_recovery')
    else:rows=None
    if rows is not None:return Response(db.csv_text(rows),media_type='text/csv',headers={'Content-Disposition':'attachment; filename='+name.split('/')[-1]}) if name.endswith('.csv') else rows
    if name in ('landcover_stats.json','gee/landcover_stats.json'):return db.cover('legacy' if name=='landcover_stats.json' else 'gee')
    if name in DB_DOCUMENTS:return db.document('public/data/'+name)
    target=(ROOT/'public/data'/name).resolve()
    if not target.is_relative_to((ROOT/'public/data').resolve()) or not target.is_file():raise HTTPException(404,'Không có dữ liệu này.')
    return FileResponse(target)
@app.get('/api/{unknown:path}')
def unknown_api(unknown:str):raise HTTPException(404,'Không tìm thấy API.')
app.mount('/',StaticFiles(directory=ROOT/'public',html=True),name='frontend')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description='MobileGIS PostgreSQL/PostGIS server')
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=5379)
    parser.add_argument('--auto-port',action='store_true');args=parser.parse_args()
    try:db.health()
    except Exception:
        print('Không thể khởi động: PostgreSQL/PostGIS chưa sẵn sàng. Xem DATABASE_POSTGRESQL.md. Không dùng lại SQLite.',flush=True);sys.exit(1)
    bound=None
    for port in range(args.port,args.port+(20 if args.auto_port else 1)):
        candidate=socket.socket()
        try:candidate.bind((args.host,port));candidate.listen(128);bound=candidate;break
        except OSError:candidate.close()
    if bound is None:raise SystemExit('Không có cổng web trống.')
    print(f'Project: {ROOT}\nVersion: {VERSION}\nMobileGIS: http://{args.host}:{port}\nDatabase: PostgreSQL / PostGIS\nKeep this window open. Ctrl+C to stop.',flush=True)
    try:uvicorn.Server(uvicorn.Config(app,host=args.host,port=port,log_level='warning')).run(sockets=[bound])
    finally:bound.close()
