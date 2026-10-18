/* PG3 statistics and simulations. No forecast is presented as a measurement. */
(()=>{
 const main=$('#reportView');main.querySelector('h1').textContent='Thống kê và phân tích môi trường';
 main.querySelector('h1+p').textContent='Phân tích trực tiếp từ GeoTIFF và PostgreSQL: chọn nguồn, năm, chỉ số, độ phủ; mọi kết quả giữ thông tin phương pháp và giới hạn.';
 // Keep supplementary CSV/images, but outside the primary research workflow.
 const appendix=el('details');appendix.id='researchAppendix';appendix.className='analysis-card';appendix.append(el('summary','Phụ lục: bốn điểm CSV và ảnh minh chứng GEE'));
 for(const child of [...main.children])if(child.classList.contains('notice')||child.querySelector('#evidenceGallery')||child.classList.contains('analysis-card')&&!['researchInsights','tvdiScreening'].includes(child.id))appendix.append(child);
 main.append(appendix);
 const card=el('section');card.className='analysis-card';card.id='pixelAnalysis';
 card.innerHTML=`<span class="eyebrow">THỐNG KÊ PIXEL · POSTGRESQL</span><h2>Phân bố chỉ số và lớp phủ đất</h2>
 <p>Min, max, trung vị và độ lệch chuẩn được tính từ ô hợp lệ trong TIFF, không suy ra từ trung bình xã/phường. Dùng bộ lọc chỉ số, năm và độ phủ ở phần “Khám phá kết quả” bên trên.</p>
 <label>Khu vực thống kê<select id="statsUnit"><option value="">Tất cả khu vực đủ độ phủ</option></select></label>
 <p id="statsStatus" role="status">Chọn tab Thống kê để tải.</p><div id="pixelKpis" class="quality-kpis"></div>
 <div class="chart-grid"><section><h3>Phân bố pixel hợp lệ</h3><svg id="histogramPlot" viewBox="0 0 620 340" role="img" aria-label="Histogram pixel hợp lệ"></svg></section>
 <section><h3>Phân bố trong các khu vực</h3><svg id="boxPlot" viewBox="0 0 620 340" role="img" aria-label="Boxplot phân bố trong khu vực"></svg><p class="small">Hộp: Q25–Q75; đường giữa: trung vị; râu: min–max. Không phải sai số dự báo.</p></section>
 <section><h3>So sánh trung bình khu vực</h3><svg id="meanBarPlot" viewBox="0 0 620 340" role="img" aria-label="Biểu đồ trung bình khu vực"></svg></section>
 <section><h3>Chỉ số theo lớp phủ 2021</h3><svg id="landcoverPlot" viewBox="0 0 620 340" role="img" aria-label="Chỉ số theo lớp phủ đất"></svg><p id="landcoverMethod" class="small"></p></section></div>
 <h3>Tương quan trung bình xã/phường · toàn vùng</h3><div class="tableWrap"><table><thead><tr><th>Cặp chỉ số</th><th>Số cặp</th><th>Pearson r</th><th>R² hồi quy đơn</th></tr></thead><tbody id="correlationRows"></tbody></table></div><p id="correlationMethod" class="small"></p>
 <details><summary>Bảng thống kê đầy đủ và xuất dữ liệu</summary><button id="exportStatistics">Tải CSV thống kê đã lọc</button><div class="tableWrap"><table><thead><tr><th>Khu vực</th><th>Pixel hợp lệ</th><th>Độ phủ</th><th>Min</th><th>Q25</th><th>Trung vị</th><th>Trung bình</th><th>Q75</th><th>Max</th><th>Độ lệch chuẩn</th></tr></thead><tbody id="pixelStatisticsRows"></tbody></table></div></details>
 <div class="toolbar"><button id="exportAnalysisCharts">Tải bộ biểu đồ SVG</button></div><p class="small">Độ lệch chuẩn mô tả độ phân tán pixel, không phải độ chính xác. Trung vị là giá trị giữa của phân bố, không phải giá trị phổ biến nhất. Histogram toàn vùng gộp mẫu theo đơn vị; ranh giới có thể có ô trùng ở mép.</p>`;
 $('#researchInsights').after(card);if($('#tvdiScreening'))card.after($('#tvdiScreening'));$('#reportTab').textContent='Thống kê';
 let request=0,timer=null,currentRows=[];
 function node(svg,tag,attrs,text){const n=svgNode(tag,attrs,text);svg.append(n);return n;}
 function initChart(id,title){const svg=$('#'+id);svg.replaceChildren();node(svg,'rect',{width:620,height:340,fill:'#fff'});node(svg,'title',{},title);node(svg,'text',{x:48,y:24,'font-size':14,'font-weight':600},title);return svg;}
 function axis(svg,lo,hi,unit=''){const range=hi-lo||1;for(let i=0;i<5;i++){const v=lo+range*i/4,y=255-i*49;node(svg,'line',{x1:64,x2:600,y1:y,y2:y,stroke:'#e2e9e6'});node(svg,'text',{x:58,y:y+4,'text-anchor':'end','font-size':11},fmt(v,Math.abs(range)>5?0:2));}node(svg,'text',{x:64,y:47,'font-size':12},unit);return v=>255-(v-lo)/range*196;}
 function empty(svg){node(svg,'text',{x:60,y:100,'font-size':14},'Không có mẫu đủ độ phủ ở bộ lọc này.');}
 function bars(id,rows,label,value,unit){const svg=initChart(id,unit);if(!rows.length)return empty(svg);const vals=rows.map(r=>r[value]),lo=Math.min(0,...vals),hi=Math.max(0,...vals)||1,y=axis(svg,lo,hi,unit),step=530/rows.length;
  rows.forEach((r,i)=>{const x=68+i*step,v=r[value];const n=node(svg,'rect',{x,y:Math.min(y(0),y(v)),width:Math.max(5,step-10),height:Math.max(1,Math.abs(y(v)-y(0))),fill:'#087b68'});n.append(svgNode('title',{},`${r[label]}: ${fmt(v)}`));const text=r[label].replace(/^(Phường|Xã) /,'');node(svg,'text',{x:x+step/2-5,y:275,transform:`rotate(20 ${x+step/2-5} 275)`,'text-anchor':'middle','font-size':10},text.length>18?text.slice(0,17)+'…':text);});
 }
 function histogram(rows,k){const svg=initChart('histogramPlot',`${k.toUpperCase()} · số pixel theo khoảng giá trị`);if(!rows.length)return empty(svg);const edges=rows[0].histogram.edges,counts=rows[0].histogram.counts.map((_,i)=>rows.reduce((sum,r)=>sum+r.histogram.counts[i],0));let first=counts.findIndex(n=>n>0),last=counts.findLastIndex(n=>n>0);if(first<0)return empty(svg);const subset=counts.slice(first,last+1),step=530/subset.length,y=axis(svg,0,Math.max(...subset),'Pixel hợp lệ');subset.forEach((n,i)=>{const x=68+i*step,b=node(svg,'rect',{x,y:y(n),width:Math.max(2,step-3),height:255-y(n),fill:'#16818c'});b.append(svgNode('title',{},`${edges[first+i]}–${edges[first+i+1]}: ${n} pixel`));if(i%Math.max(1,Math.ceil(subset.length/7))===0)node(svg,'text',{x,y:278,'font-size':11},fmt(edges[first+i],k==='lst'?0:2));});node(svg,'text',{x:590,y:310,'text-anchor':'end','font-size':12},specs[k].unit||k.toUpperCase());}
 function boxes(rows,k){const svg=initChart('boxPlot',`${k.toUpperCase()} · phân vị từ pixel`);let shown=rows.filter(r=>state.pinned.includes(r.code));if(!shown.length)shown=rows.slice(0,6);shown=shown.filter(r=>valid(r.minimum)).slice(0,6);if(!shown.length)return empty(svg);const lo=Math.min(...shown.map(r=>r.minimum)),hi=Math.max(...shown.map(r=>r.maximum)),y=axis(svg,lo,hi,specs[k].unit),step=530/shown.length;
  shown.forEach((r,i)=>{const x=68+(i+.5)*step;node(svg,'line',{x1:x,x2:x,y1:y(r.minimum),y2:y(r.maximum),stroke:'#087b68','stroke-width':2});for(const v of [r.minimum,r.maximum])node(svg,'line',{x1:x-10,x2:x+10,y1:y(v),y2:y(v),stroke:'#087b68'});node(svg,'rect',{x:x-19,y:y(r.q75),width:38,height:Math.max(1,y(r.q25)-y(r.q75)),fill:'#d8f0e4',stroke:'#087b68'});node(svg,'line',{x1:x-19,x2:x+19,y1:y(r.median),y2:y(r.median),stroke:'#af5317','stroke-width':3});node(svg,'text',{x,y:279,'text-anchor':'middle','font-size':10},r.name.replace(/^(Phường|Xã) /,'').slice(0,19));});
 }
 async function refresh(){
  if(main.hidden)return;if(!state.real.length)return;
  const source=state.researchSource,k=$('#insightIndex').value,year=Number($('#insightYear').value),coverage=Number($('#insightCoverage').value),code=$('#statsUnit').value;
  if(!$('#statsUnit').dataset.ready&&state.geo){for(const f of state.geo.features){const o=el('option',f.properties.full_name);o.value=f.id;$('#statsUnit').append(o);}$('#statsUnit').dataset.ready='1';}
  const id=++request;$('#statsStatus').textContent='Đang truy vấn thống kê PostgreSQL…';
  const params=new URLSearchParams({source,year,index:k,coverage,...(code?{code}:{})});
  try{const [stats,cover,corr]=await Promise.all([json('/api/analysis/statistics?'+params),json('/api/analysis/landcover?'+params),json(`/api/analysis/correlations?source=${source}&year=${year}&coverage=${coverage}`)]);if(id!==request)return;
   currentRows=stats.units;$('#exportStatistics').disabled=!currentRows.length;$('#exportAnalysisCharts').disabled=!currentRows.length;const rows=stats.units.filter(r=>r.valid_count>0),count=rows.reduce((s,r)=>s+r.valid_count,0),mean=count?rows.reduce((s,r)=>s+r.mean*r.valid_count,0)/count:null;
   $('#statsStatus').textContent=`${activeSourceName()} · ${year} · ${k.toUpperCase()} · ${rows.length} khu vực · độ phủ ≥ ${coverage*100}%. Không phải trung bình năm.`;
   $('#pixelKpis').replaceChildren();for(const [v,label] of [[count.toLocaleString('vi-VN'),'Mẫu hợp lệ trong nhóm'],[fmt(mean),'Trung bình theo số pixel'],[fmt(rows.length?Math.min(...rows.map(r=>r.minimum)):null),'Giá trị thấp nhất'],[fmt(rows.length?Math.max(...rows.map(r=>r.maximum)):null),'Giá trị cao nhất']]){const c=el('div');c.append(el('strong',v),el('small',label));$('#pixelKpis').append(c);}
   histogram(rows,k);boxes(rows,k);bars('meanBarPlot',[...rows].sort((a,b)=>b.mean-a.mean).slice(0,8),'name','mean',`${k.toUpperCase()} ${specs[k].unit} · tối đa 8 khu vực có trung bình cao`);
   bars('landcoverPlot',cover.classes,'class_name','mean',`${k.toUpperCase()} ${specs[k].unit} · trung bình pixel theo lớp phủ`);$('#landcoverMethod').textContent=cover.note;
   $('#correlationRows').replaceChildren();for(const r of corr.pairs){const tr=el('tr');[r.x.toUpperCase()+' – '+r.y.toUpperCase(),r.n,fmt(r.r,3),fmt(r.r_squared,3)].forEach(v=>tr.append(el('td',v)));$('#correlationRows').append(tr);}$('#correlationMethod').textContent=corr.note;
   $('#pixelStatisticsRows').replaceChildren();for(const r of rows){const tr=el('tr');[r.name,r.valid_count,(r.coverage*100).toFixed(1)+'%',...['minimum','q25','median','mean','q75','maximum','stddev'].map(k=>fmt(r[k]))].forEach(v=>tr.append(el('td',v)));$('#pixelStatisticsRows').append(tr);}
  }catch(e){if(id===request){currentRows=[];$('#exportStatistics').disabled=true;$('#exportAnalysisCharts').disabled=true;$('#statsStatus').textContent='Không tải được thống kê: '+e.message;for(const name of ['pixelKpis','pixelStatisticsRows','correlationRows','histogramPlot','boxPlot','meanBarPlot','landcoverPlot'])$('#'+name).replaceChildren();$('#correlationMethod').textContent='';$('#landcoverMethod').textContent='';}}
 }
 function schedule(){
  clearTimeout(timer);request++;currentRows=[];
  $('#exportStatistics').disabled=true;$('#exportAnalysisCharts').disabled=true;
  if(!main.hidden){$('#statsStatus').textContent='Đang tải thống kê theo bộ lọc mới…';for(const id of ['pixelKpis','pixelStatisticsRows','correlationRows','histogramPlot','boxPlot','meanBarPlot','landcoverPlot'])$('#'+id).replaceChildren();$('#correlationMethod').textContent='';$('#landcoverMethod').textContent='';}
  timer=setTimeout(refresh,120);
 }
 for(const id of ['insightIndex','insightYear','insightCoverage','statsUnit'])$('#'+id).addEventListener('change',schedule);
 window.addEventListener('researchchange',schedule);
 const reportClick=$('#reportTab').onclick;$('#reportTab').onclick=()=>{reportClick();schedule();};
 $('#exportStatistics').onclick=()=>{if(!currentRows.length)return toast('Chưa có thống kê để xuất.');const cols=['dataset_id','code','name','year','index_name','sample_count','valid_count','coverage','minimum','q25','median','mean','q75','maximum','stddev','method','raster_sha256'];const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';downloadText('\ufeff'+[cols.join(','),...currentRows.map(r=>cols.map(k=>quote(r[k])).join(','))].join('\r\n'),'MobileGIS_thong_ke_pixel.csv');};
 $('#exportAnalysisCharts').onclick=()=>{if(!currentRows.length)return toast('Chưa có thống kê theo bộ lọc này để xuất.');for(const id of ['histogramPlot','boxPlot','meanBarPlot','landcoverPlot']){const svg=$('#'+id).cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('font-family','Segoe UI, Arial');downloadText(new XMLSerializer().serializeToString(svg),id+'.svg','image/svg+xml;charset=utf-8');}};

 const scenarioView=el('main');scenarioView.id='scenarioView';scenarioView.className='page';scenarioView.hidden=true;
 scenarioView.innerHTML=`<span class="eyebrow">KẾT QUẢ TÁCH BIỆT VỚI HIỆN TRẠNG</span><h1>Kịch bản giả lập</h1>
 <p class="notice">Đây là công cụ minh họa giả định, không phải dự báo đã kiểm chứng. Mỗi chỉ số được cộng mức thay đổi độc lập; không mô phỏng quan hệ vật lý giữa cây xanh, nhiệt độ và độ khô.</p>
 <section class="analysis-card"><h2>Tạo và lưu một lần chạy</h2><form id="scenarioForm"><div class="scenario-fields">
 <label>Tên kịch bản<input id="scenarioTitle" required maxlength="150" value="Kịch bản minh họa từ hiện trạng 2025"></label>
 <label>Nguồn hiện trạng<select id="scenarioSource"><option value="gee_recovery">GEE · đã bổ sung 2025</option><option value="gee">GEE · bản gốc</option><option value="legacy">Bộ xử lý cũ</option></select></label>
 <label>Năm cơ sở<select id="scenarioBase"><option>2020</option><option>2021</option><option>2022</option><option>2023</option><option>2024</option><option selected>2025</option></select></label>
 <label>Năm gắn nhãn kịch bản<input id="scenarioTarget" type="number" min="2020" max="2100" value="2026" required></label>
 <label>Thay đổi LST (°C)<input id="scenarioLst" type="number" min="-10" max="10" step="0.1" value="0" required></label>
 <label>Thay đổi NDVI<input id="scenarioNdvi" type="number" min="-1" max="1" step="0.01" value="0" required></label>
 <label>Thay đổi TVDI<input id="scenarioTvdi" type="number" min="-1" max="1" step="0.01" value="0" required></label>
 <label>Độ phủ hiện trạng tối thiểu<select id="scenarioCoverage"><option value="0.5">50%</option><option value="0.8">80%</option><option value="0.1">10% · thận trọng</option></select></label></div>
 <p class="small">Ví dụ năm 2026 chỉ là nhãn kịch bản; không có nghĩa đã tải ảnh GEE 2026. Dữ liệu cơ sở thiếu/độ phủ thấp sẽ để trống. Giá trị vượt miền hợp lệ được chặn và đánh dấu.</p>
 <button class="primary" id="saveScenario">Tạo giả lập và lưu PostgreSQL</button></form><p id="scenarioStatus" role="status"></p></section>
 <section class="analysis-card"><h2>Lịch sử kết quả mô hình / giả lập</h2><label>Lần chạy<select id="scenarioRun"></select></label><p id="scenarioMethod"></p><div class="toolbar"><button id="exportScenario">Xuất CSV kết quả</button></div><div class="tableWrap"><table><thead><tr><th>Khu vực</th><th>Năm</th><th>LST cơ sở</th><th>LST kết quả</th><th>NDVI cơ sở</th><th>NDVI kết quả</th><th>TVDI cơ sở</th><th>TVDI kết quả</th><th>Trạng thái</th></tr></thead><tbody id="scenarioRows"></tbody></table></div></section>
 <p>CSDL có thể lưu kết quả dự báo và RMSE/MAE/Bias của một mô hình được kiểm định. Bản này chỉ cung cấp giả lập; không tạo số đánh giá độ chính xác khi chưa có dữ liệu đối chứng.</p>`;
 document.body.insertBefore(scenarioView,$('#editor'));
 const scenarioTab=el('button','Kịch bản');scenarioTab.id='scenarioTab';$('#sourcesTab').before(scenarioTab);
 let runData=null,runRequest=0;
 const statusName=s=>({simulated:'Giả lập',clipped:'Giới hạn miền hợp lệ',insufficient_base_coverage:'Thiếu mẫu cơ sở'}[s]||s);
 async function loadRuns(selected){try{const data=await json('/api/analysis/runs');$('#scenarioRun').replaceChildren();if(!data.length){const o=el('option','Chưa có lần chạy; tạo kịch bản ở trên');o.value='';$('#scenarioRun').append(o);$('#scenarioRows').replaceChildren();return;}for(const r of data){const o=el('option',`${r.result_kind==='simulation'?'GIẢ LẬP':'DỰ BÁO'} · ${r.title} · ${r.base_year}→${r.target_year}`);o.value=r.id;$('#scenarioRun').append(o);}if(selected)$('#scenarioRun').value=selected;await loadRun();}catch(e){$('#scenarioStatus').textContent=e.message;}}
 async function loadRun(){
  const id=$('#scenarioRun').value;if(!id)return;const req=++runRequest;
  try{
   const result=await json('/api/analysis/runs/'+id);const baseline=await json(`/api/research/observations?source=${result.run.source_dataset_id}&year=${result.run.base_year}`);if(req!==runRequest)return;runData=result;
   const sourceName={gee_recovery:'GEE đã bổ sung 2025',gee:'GEE bản gốc',legacy:'Bộ xử lý cũ'}[result.run.source_dataset_id]||result.run.source_dataset_id;
   const method=result.run.method==='independent_offsets'?'Cộng mức thay đổi độc lập':result.run.method;
   $('#scenarioMethod').textContent=`${result.run.result_kind==='simulation'?'GIẢ LẬP':'DỰ BÁO'} · Nguồn cơ sở: ${sourceName}, ${result.run.base_year} · Nhãn kịch bản: ${result.run.target_year} · ${method} ${result.run.method_version} · ${new Date(result.run.created_at).toLocaleString('vi-VN')} · ${result.run.note}`;
   $('#scenarioRows').replaceChildren();for(const r of result.units){const b=baseline.find(x=>x.code===r.code),tr=el('tr');[r.name,r.year,fmt(b?.lst),fmt(r.lst),fmt(b?.ndvi),fmt(r.ndvi),fmt(b?.tvdi),fmt(r.tvdi),[r.lst_status,r.ndvi_status,r.tvdi_status].map(statusName).join(' / ')].forEach(v=>tr.append(el('td',v)));$('#scenarioRows').append(tr);}
  }catch(e){runData=null;$('#scenarioRows').replaceChildren();$('#scenarioMethod').textContent='';$('#scenarioStatus').textContent=e.message;}
 }
 $('#scenarioRun').onchange=loadRun;
 $('#scenarioForm').onsubmit=async e=>{e.preventDefault();const button=$('#saveScenario');button.disabled=true;$('#scenarioStatus').textContent='Đang tạo giả lập trong giao dịch PostgreSQL…';try{state.token=(await json('/api/session')).token;const result=await json('/api/analysis/simulate',{title:$('#scenarioTitle').value,source:$('#scenarioSource').value,base_year:Number($('#scenarioBase').value),target_year:Number($('#scenarioTarget').value),lst_delta:Number($('#scenarioLst').value),ndvi_delta:Number($('#scenarioNdvi').value),tvdi_delta:Number($('#scenarioTvdi').value),coverage:Number($('#scenarioCoverage').value)});$('#scenarioStatus').textContent='Đã lưu GIẢ LẬP; hiện trạng GEE không thay đổi.';await loadRuns(result.id);}catch(e){$('#scenarioStatus').textContent=e.message;}finally{button.disabled=false;}};
 $('#exportScenario').onclick=()=>{if(!runData)return toast('Chưa chọn kết quả.');const cols=['run_id','result_kind','source','base_year','code','name','year','lst','ndvi','tvdi','lst_status','ndvi_status','tvdi_status'];const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';downloadText('\ufeff'+[cols.join(','),...runData.units.map(r=>{const row={...r,run_id:runData.run.id,result_kind:runData.run.result_kind,source:runData.run.source_dataset_id,base_year:runData.run.base_year};return cols.map(k=>quote(row[k])).join(',');})].join('\r\n'),'MobileGIS_gia_lap_'+runData.run.target_year+'.csv');};
 for(const name of ['map','data','report','sources']){const button=$('#'+name+'Tab'),old=button.onclick;button.onclick=()=>{scenarioView.hidden=true;scenarioTab.classList.remove('active');old();};}
 scenarioTab.onclick=()=>{stopPlay();for(const name of ['map','data','report','sources']){$('#'+name+'View').hidden=true;$('#'+name+'Tab').classList.remove('active');}scenarioView.hidden=false;scenarioTab.classList.add('active');loadRuns();};
 $('#boundaries').addEventListener('change',renderLabels);
})();
