"""SQL analysis and explicitly labelled simulations, never fake observations."""
import math,uuid
import database as db
from psycopg.types.json import Jsonb

INDICES=('lst','ndvi','tvdi')
LIMITS={'lst':(-80,100),'ndvi':(-1,1),'tvdi':(0,1)}

def statistics(source,year,index,coverage=.5,code=None):
    if source not in db.SOURCES or index not in INDICES:raise ValueError('Nguồn/chỉ số không hợp lệ.')
    q='''SELECT s.*,a.name,m.coverage,m.valid_pixels FROM mobilegis.pixel_statistics s
    JOIN mobilegis.unit_observations o USING(dataset_id,code,year)
    JOIN mobilegis.'''+index+'''_observations m USING(dataset_id,code,year)
    JOIN mobilegis.admin_units a ON a.boundary_id=o.boundary_id AND a.code=o.code
    WHERE s.dataset_id=%s AND s.year=%s AND s.index_name=%s AND m.coverage>=%s'''
    args=[source,year,index,coverage]
    if code:q+=' AND s.code=%s';args.append(code)
    with db.connect() as c:rows=c.execute(q+' ORDER BY s.code',args).fetchall()
    return {'source':source,'year':year,'index':index,'minimum_coverage':coverage,
            'scope':'Pixel-centre statistics within each original reference polygon; not annual averages.',
            'units':rows}

def landcover(source,year,index,coverage=.5,code=None):
    if source not in db.SOURCES or index not in INDICES:raise ValueError('Nguồn/chỉ số không hợp lệ.')
    q='''SELECT s.class_code,s.class_name,sum(s.valid_count)::bigint AS valid_count,
       sum(s.mean*s.valid_count)/sum(s.valid_count) AS mean,count(*) AS units
    FROM mobilegis.index_landcover_statistics s
    JOIN mobilegis.'''+index+'''_observations m USING(dataset_id,code,year)
    WHERE s.dataset_id=%s AND s.year=%s AND s.index_name=%s AND m.coverage>=%s'''
    args=[source,year,index,coverage]
    if code:q+=' AND s.code=%s';args.append(code)
    with db.connect() as c:rows=c.execute(q+' GROUP BY s.class_code,s.class_name ORDER BY s.class_code',args).fetchall()
    return {'classes':rows,'reference_year':2021,'sample_resolution_m':120,
            'note':'Lớp phủ 2021 lấy mẫu gần nhất trên lưới chỉ số 120 m; không phải lớp phủ của từng năm. Tính trên pixel hợp lệ, không dùng tỷ lệ lớp phủ để suy ra nhiệt độ.'}

def correlations(source,year,coverage=.5):
    rows=db.observations(source,year);results=[]
    for x,y in (('ndvi','lst'),('tvdi','lst'),('ndvi','tvdi')):
        pairs=[(r[x],r[y]) for r in rows if r[x] is not None and r[y] is not None and
               r[x+'_coverage']>=coverage and r[y+'_coverage']>=coverage]
        n=len(pairs);r=None;slope=None;intercept=None
        if n>=3:
            mx=sum(a for a,b in pairs)/n;my=sum(b for a,b in pairs)/n
            xx=sum((a-mx)**2 for a,b in pairs);yy=sum((b-my)**2 for a,b in pairs)
            xy=sum((a-mx)*(b-my) for a,b in pairs)
            if xx>0 and yy>0:r=max(-1,min(1,xy/math.sqrt(xx*yy)));slope=xy/xx;intercept=my-slope*mx
        results.append({'x':x,'y':y,'n':n,'r':r,'r_squared':None if r is None else r*r,'slope':slope,'intercept':intercept})
    return {'pairs':results,'note':'Tương quan giữa trung bình xã/phường, không phải pixel; không chứng minh nhân quả. TVDI có LST/NDVI trong công thức nên có phụ thuộc toán học.'}

def runs():
    with db.connect() as c:return c.execute('SELECT * FROM mobilegis.analysis_runs ORDER BY created_at DESC LIMIT 100').fetchall()

def results(run_id):
    with db.connect() as c:
        run=c.execute('SELECT * FROM mobilegis.analysis_runs WHERE id=%s',(run_id,)).fetchone()
        if not run:raise ValueError('Không tìm thấy lần chạy.')
        rows=c.execute('''SELECT u.code,u.year,a.name,l.value AS lst,n.value AS ndvi,t.value AS tvdi,
          l.status AS lst_status,n.status AS ndvi_status,t.status AS tvdi_status
          FROM mobilegis.result_units u
          JOIN mobilegis.lst_results l USING(run_id,code,year)
          JOIN mobilegis.ndvi_results n USING(run_id,code,year)
          JOIN mobilegis.tvdi_results t USING(run_id,code,year)
          JOIN mobilegis.admin_units a ON a.boundary_id=u.boundary_id AND a.code=u.code
          WHERE u.run_id=%s ORDER BY u.code''',(run_id,)).fetchall()
    return {'run':run,'units':rows}

def simulate(body):
    def year(key,default):
        value=body.get(key,default)
        if isinstance(value,bool) or not math.isfinite(float(value)) or float(value)!=int(value):
            raise ValueError('Năm phải là số nguyên.')
        return int(value)
    source=body.get('source','gee_recovery');base=year('base_year',2025);target=year('target_year',2026)
    title=str(body.get('title','Kịch bản giả lập độc lập')).strip()
    if source not in db.SOURCES or not 2020<=base<=2025 or not 2020<=target<=2100 or not 1<=len(title)<=150:raise ValueError('Nguồn, năm hoặc tên kịch bản không hợp lệ.')
    coverage=float(body.get('coverage',.5))
    if not math.isfinite(coverage) or not .1<=coverage<=1:raise ValueError('Độ phủ cần từ 10% đến 100%.')
    offsets={k:float(body.get(k+'_delta',0)) for k in INDICES}
    for k,v in offsets.items():
        if not math.isfinite(v) or abs(v)>(10 if k=='lst' else 1):raise ValueError('Mức thay đổi nằm ngoài phạm vi cho phép.')
    base_rows=db.observations(source,base)
    if not base_rows:raise ValueError('Chưa có hiện trạng để tạo kịch bản.')
    run_id=uuid.uuid4()
    note='GIẢ LẬP: cộng mức thay đổi độc lập vào trung bình hiện trạng; không có mô hình vật lý/huấn luyện, không phải dự báo hoặc số đo GEE. Giá trị vượt miền được chặn và ghi trạng thái clipped; mẫu dưới độ phủ để trống.'
    with db.connect() as c:
        c.execute('''INSERT INTO mobilegis.analysis_runs(id,title,result_kind,source_dataset_id,boundary_id,base_year,target_year,method,method_version,parameters,note)
          VALUES(%s,%s,'simulation',%s,%s,%s,%s,'independent_offsets','1.0',%s,%s)''',
          (run_id,title,source,db.BOUNDARY,base,target,Jsonb({'offsets':offsets,'minimum_coverage':coverage}),note))
        for r in base_rows:
            c.execute('INSERT INTO mobilegis.result_units VALUES(%s,%s,%s,%s)',(run_id,db.BOUNDARY,r['code'],target))
            for k in INDICES:
                v=r[k];status='simulated'
                if v is None or r[k+'_coverage']<coverage:v=None;status='insufficient_base_coverage'
                else:
                    raw=v+offsets[k];v=max(LIMITS[k][0],min(LIMITS[k][1],raw))
                    if v!=raw:status='clipped'
                c.execute(f'INSERT INTO mobilegis.{k}_results(run_id,code,year,value,status) VALUES(%s,%s,%s,%s,%s)',(run_id,r['code'],target,v,status))
    return {'id':str(run_id),'result_kind':'simulation','note':note}
