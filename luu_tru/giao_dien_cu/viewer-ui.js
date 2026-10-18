/* Public viewing workflow; advanced controls are a UI preference, NOT authorization. */
(()=>{
  const policy=ViewerPolicy;let advanced=false,tableInitialized=false;
  if(innerWidth<=760)state.legendCollapsed=true;
  const names={lst:'Nhiệt độ bề mặt',ndvi:'Mức độ xanh thực vật',tvdi:'Độ khô tương đối'};
  const explanations={lst:'LST là nhiệt độ bề mặt đất, mái nhà, cây… tại mốc ảnh, không phải nhiệt độ không khí.',ndvi:'NDVI mô tả mức độ xanh của thực vật. Giá trị cao thường gắn với thực vật xanh; không phải số lượng cây.',tvdi:'TVDI mô tả độ khô tương đối từ LST và NDVI. Đây là chỉ số thử nghiệm, chưa dùng để kết luận hạn hán.'};
  function mark(node){if(node)node.dataset.advanced='';}
  function moveControl(id,parent){const node=$('#'+id),label=document.querySelector(`label[for="${id}"]`);if(label)parent.append(label);if(node)parent.append(node);}

  $('#sourcesTab').textContent='Dữ liệu & phương pháp';$('#dataTab').textContent='Bảng số liệu';$('#scenarioTab').textContent='Giả lập';
  mark($('#versionTag'));
  const status=el('span','Ảnh vệ tinh · 2020–2025');status.id='viewerStatus';status.className='tag';$('#versionTag').after(status);
  const sources=$('#sourcesView'),technical=el('div');technical.id='technicalSources';mark(technical);
  technical.append(...sources.childNodes);sources.append(technical);
  const publicSource=el('section');publicSource.className='viewer-source';
  publicSource.innerHTML=`<span class="eyebrow">HIỂU DỮ LIỆU TRƯỚC KHI ĐỌC KẾT QUẢ</span><h1>Dữ liệu & phương pháp</h1>
    <p>Ảnh Landsat được xử lý bằng Google Earth Engine (GEE), gồm các mốc mùa khô 2020–2025. Bản xem mặc định đã bao gồm phần bổ sung thực năm 2025; không trộn với bộ xử lý cũ hoặc dữ liệu giả lập.</p>
    <div class="viewer-methods"><article><h2>Nhiệt độ bề mặt · LST</h2><p>Đơn vị °C. Cho biết bề mặt nóng hay mát tại mốc ảnh; không phải nhiệt độ không khí.</p></article><article><h2>Thực vật · NDVI</h2><p>Chỉ số xanh thực vật, không có đơn vị. Không chuyển trực tiếp thành số cây hay diện tích cây xanh.</p></article><article><h2>Độ khô · TVDI</h2><p>Chỉ số tương đối từ 0 đến 1, đang thử nghiệm. Không phải cảnh báo hạn đã được kiểm định.</p></article></div>
    <section class="analysis-card"><h2>Dữ liệu có đầy đủ không?</h2><p id="viewerSourceQuality" role="status">Đang kiểm tra bộ ảnh…</p><p>Độ phủ là tỷ lệ ô mẫu hợp lệ trong một khu vực, không phải độ chính xác. Có số liệu ở 167 khu vực không có nghĩa là có ảnh kín 167 khu vực.</p><div class="tableWrap"><table><thead><tr><th>Năm</th><th>LST: độ phủ ≥50%</th><th>NDVI: độ phủ ≥50%</th><th>TVDI: độ phủ ≥50%</th></tr></thead><tbody id="viewerYearQuality"></tbody></table></div><p class="small">50% là ngưỡng hỗ trợ đọc/so sánh trên giao diện, không phải chứng nhận chất lượng. Số liệu ít mẫu vẫn giữ trong bảng gốc và được đánh dấu.</p><a href="/data/gee_recovery/observations.csv" download>Tải bảng số liệu hiện trạng 2020–2025</a></section>
    <section class="analysis-card"><h2>Cách đọc bản đồ</h2><p>Mỗi ô chỉ số có kích thước lấy mẫu 120 m. Vùng không có màu là nơi không có mẫu hợp lệ, có thể do mây hoặc dữ liệu đầu vào thiếu; không phải giá trị 0. Không nội suy để tô kín vùng này.</p><p>Trung bình xã/phường chỉ tính từ các ô hợp lệ. Biểu đồ mặc định ngắt tại năm thiếu giá trị hoặc độ phủ dưới 50%. Cùng một mùa nhưng ngày ảnh có thể khác nhau giữa vùng và năm, nên không diễn giải chuỗi như trung bình năm hay xu thế khí hậu.</p><p>Ranh giới tham chiếu năm 2025 dùng chung cho mọi mốc; không phải ranh giới lịch sử. Lớp phủ đất ESA chỉ mô tả năm 2021, không phải bản đồ cây xanh cập nhật từng năm.</p><p>Tab Giả lập tạo kịch bản cộng mức thay đổi; kết quả tách khỏi hiện trạng và không phải dự báo đã kiểm định.</p></section>
    <section class="analysis-card"><h2>Đối chiếu nguồn và công cụ kỹ thuật</h2><p>Chỉ cần mở khi muốn đối chiếu bản xuất gốc, CSV bổ sung, dữ liệu thực hành hoặc thiết kế PostgreSQL/PostGIS.</p><button id="toggleAdvanced" type="button" aria-pressed="false" aria-controls="technicalSources">Mở công cụ nâng cao</button><p class="small">Đây là chế độ hiển thị, không phải đăng nhập hay phân quyền bảo mật. Khi đưa lên Internet cần bổ sung kiểm soát truy cập ở máy chủ.</p></section>`;
  sources.prepend(publicSource);
  const controls=el('section');controls.className='analysis-card';controls.id='advancedSourceControls';controls.append(el('h2','Chọn dữ liệu để đối chiếu'));
  moveControl('dataset',controls);moveControl('researchSource',controls);controls.append($('#sourceAvailability'));
  controls.append(el('p','Lựa chọn này áp dụng cho bản đồ, bảng và thống kê. Quay về chế độ người xem sẽ tự khôi phục bộ hiện trạng GEE đã bổ sung 2025. Dữ liệu thực hành không phải số đo vệ tinh.'));
  technical.prepend(controls);
  for(const id of ['tableResearchSource','tableDataset','analysisResearchSource','scenarioSource']){const n=$('#'+id);mark(n.closest('label')||n);mark(document.querySelector(`label[for="${id}"]`));}
  mark($('#researchAppendix'));
  const settings=el('details');settings.className='viewer-map-options';settings.append(el('summary','Hiển thị và lớp phủ'));
  const first=$('label[for="basemap"]');first.before(settings);
  for(let n=first;n&&n.id!=='connectionStatus';){const next=n.nextElementSibling;if(n.classList.contains('actions'))break;settings.append(n);n=next;}
  $('#displayMode option[value="raster"]').textContent='Phân bố trên ảnh vệ tinh';$('#displayMode option[value="zones"]').textContent='Trung bình xã/phường · lưu ý độ phủ';
  document.querySelectorAll('[data-index]').forEach(b=>b.querySelector('span').textContent={lst:'Bề mặt · °C',ndvi:'Thực vật',tvdi:'Độ khô *'}[b.dataset.index]);
  const help=el('p');help.id='indexExplanation';help.className='viewer-help';$('.indices').after(help);
  const hint=el('p','Chọn khu vực → chọn năm → đọc chỉ số và độ phủ.');hint.className='viewer-start';$('#datasetNotice').before(hint);
  const qualityHint=el('p');qualityHint.id='viewerMapQuality';qualityHint.className='viewer-help';$('#displayMode').after(qualityHint);
  const detailQuality=el('p');detailQuality.id='viewerDetailQuality';detailQuality.setAttribute('role','status');$('#coverage').after(detailQuality);
  const dates=el('details');dates.className='viewer-provenance';dates.append(el('summary','Nguồn và ngày ảnh'));$('#source').before(dates);dates.append($('#source'),$('#downloadRaster'));
  const chartNote=el('p','Chuỗi so sánh chỉ hiển thị mốc có độ phủ ≥50%; không nối qua khoảng thiếu.');chartNote.id='viewerChartNote';chartNote.className='small';$('#chart').after(chartNote);
  const loading=el('div');loading.id='viewerLoading';loading.setAttribute('role','status');loading.textContent='Đang tải bộ ảnh hiện trạng…';$('.mapArea').append(loading);
  $('#reportView h1+p').textContent='Khám phá hiện trạng từ ảnh vệ tinh: chọn năm, chỉ số và độ phủ để so sánh. Kết quả luôn kèm giới hạn dữ liệu, không phải kết luận môi trường đã kiểm định.';
  $('#pixelAnalysis .eyebrow').textContent='THỐNG KÊ TỪ Ô ẢNH HỢP LỆ';
  $('#saveScenario').textContent='Tạo và lưu giả lập';mark($('#scenarioView>p:last-child'));

  const originalApply=window.applyResearchSource;
  window.applyResearchSource=function(source){
    if(!advanced&&source!==policy.canonicalSource&&state.recoveredProduct)source=policy.canonicalSource;
    originalApply(source);
    if(!advanced&&policy.ready(state)){$('#tableYear').value=String(state.year);tableInitialized=true;renderTable();}
    sync();
  };
  $('#toggleAdvanced').onclick=()=>{
    advanced=!advanced;document.body.classList.toggle('advanced-mode',advanced);$('#toggleAdvanced').setAttribute('aria-pressed',String(advanced));$('#toggleAdvanced').textContent=advanced?'Quay về chế độ người xem':'Mở công cụ nâng cao';
    if(!advanced){stopPlay();state.mode='real';$('#dataset').value='real';$('#tableDataset').value='real';state.selected='26743';$('#search').value='';$('#landcover').checked=false;$('#compare').checked=false;$('#displayMode').value='raster';for(const id of ['insightCoverage','alertCoverage','scenarioCoverage'])$('#'+id).value='0.5';window.applyResearchSource(policy.canonicalSource);}
    render();renderTable();window.dispatchEvent(new Event('researchchange'));
  };
  const priorZones=zoneStyle;
  zoneStyle=function(feature){const style=priorZones(feature),row=state.real.find(r=>r.code===feature.id&&r.year===state.year);
    if(!advanced&&state.mode==='real'&&!$('#landcover').checked&&$('#displayMode').value==='zones'&&!policy.eligible(row,state.index)){style.fillColor='#d8dfdc';style.dashArray='4 4';}return style;
  };
  const priorSummary=renderSummary;
  renderSummary=function(){
    if(advanced||state.mode!=='real'||$('#landcover').checked)return priorSummary();
    const all=state.real.filter(r=>r.year===state.year),q=policy.summary(all,state.index),box=$('#mapSummary');box.replaceChildren();
    for(const [value,label] of [[changeMode()?'2020 → 2025':state.year,'Mốc ảnh'],[`${q.adequate}/${state.geo?.features.length||167}`,changeMode()?'Độ phủ 2025 ≥50%':'Khu vực phủ ≥50%'],['120 m','Ô mẫu ảnh']]){const c=el('div');c.append(el('strong',String(value)),el('span',label));box.append(c);}
  };
  const priorChart=renderChart;
  renderChart=function(){
    if(advanced||state.mode!=='real')return priorChart();
    const svg=$('#chart');svg.replaceChildren();const seq=state.real.filter(r=>r.code===state.selected),segments=policy.chartSegments(seq,state.index),values=segments.flat().map(r=>r[state.index]);
    if(!values.length){svg.append(svgNode('text',{x:180,y:55,'text-anchor':'middle'},'Chưa có mốc đạt độ phủ 50%'));return;}
    let lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.2,state.index==='lst'?1:.02);lo-=pad;hi+=pad;
    for(let i=0;i<3;i++){const v=lo+(hi-lo)*i/2,cy=90-i*32;svg.append(svgNode('line',{x1:42,x2:350,y1:cy,y2:cy,stroke:'#dbe7e0'}),svgNode('text',{x:37,y:cy+3,'text-anchor':'end'},fmt(v,state.index==='lst'?1:2)));}
    for(let year=2020;year<=2025;year++)svg.append(svgNode('text',{x:48+(year-2020)*59,y:110,'text-anchor':'middle'},String(year)));
    for(const segment of segments){let last=null;for(const r of segment){const x=48+(r.year-2020)*59,cy=90-(r[state.index]-lo)/(hi-lo)*64;if(last)svg.append(svgNode('line',{x1:last.x,y1:last.cy,x2:x,y2:cy,stroke:'#08705b','stroke-width':2.5}));const dot=svgNode('circle',{cx:x,cy,r:3.5,fill:'#08705b'});dot.append(svgNode('title',{},`${r.year}: ${fmt(r[state.index])} · độ phủ ${(r[state.index+'_coverage']*100).toFixed(1)}%`));svg.append(dot);last={x,cy};}}
  };
  const priorDetail=renderDetail;
  renderDetail=function(){priorDetail();const row=selectedRow();detailQuality.textContent='';detailQuality.className='';
    chartNote.hidden=advanced||state.mode!=='real';
    if(state.mode!=='real')return;
    const q=policy.quality(row,state.index);detailQuality.className='viewer-quality '+q;
    detailQuality.textContent=q==='missing'?'Chưa có giá trị hợp lệ ở mốc này. Không xem vùng trống là 0.':q==='unknown'?'Chưa xác định được độ phủ. Chưa nên so sánh với khu vực khác.':q==='limited'?`Ít mẫu: độ phủ ${(row[state.index+'_coverage']*100).toFixed(1)}%. Giá trị chỉ mô tả phần có mẫu, chưa đại diện toàn phường. Không dùng để xếp hạng mặc định.`:`Độ phủ ${(row[state.index+'_coverage']*100).toFixed(1)}%. Trung bình phần có mẫu hợp lệ, không phải toàn bộ khu vực hay độ chính xác.`;
    $('#metrics').querySelectorAll('div').forEach((box,i)=>{const k=['lst','ndvi','tvdi'][i],q=policy.quality(row,k);box.classList.toggle('limited',q!=='adequate');box.title=names[k]+' · '+(q==='limited'?'Ít mẫu; xem độ phủ':q==='missing'?'Thiếu giá trị':'Đọc cùng độ phủ');if(row&&q==='limited')box.append(el('small','Ít mẫu'));});
  };
  const priorTable=renderTable;
  renderTable=function(){
    if(!advanced&&!tableInitialized&&policy.ready(state)){$('#tableYear').value=String(state.year);tableInitialized=true;}
    priorTable();if(state.mode!=='real')return;
    if(!advanced)$('#tableNotice').textContent='Hiện trạng mùa khô từ ảnh Landsat 2020–2025. “Ít mẫu” là độ phủ dưới 50%; giá trị vẫn giữ nguyên nhưng chưa đại diện cả phường. Ô trống là thiếu dữ liệu, không phải 0. Xuất CSV giữ cả số liệu và độ phủ gốc.';
    const rows=filteredRecords();$('#rows').querySelectorAll('tr').forEach((tr,i)=>{const r=rows[i];['lst','ndvi','tvdi'].forEach((k,j)=>{const q=policy.quality(r,k),cell=tr.children[j+3];if(!cell||q==='adequate')return;cell.classList.add('viewer-cell-'+q);cell.append(el('small',q==='limited'?'Ít mẫu':q==='unknown'?'Chưa rõ độ phủ':'Thiếu dữ liệu'));cell.title=names[k]+' · '+(Number.isFinite(r[k+'_coverage'])?'độ phủ '+(r[k+'_coverage']*100).toFixed(1)+'%':'độ phủ chưa xác định');});});
  };
  const priorLegend=renderLegend;
  renderLegend=function(){priorLegend();for(const small of $('#legendContent').querySelectorAll('small'))small.textContent=small.textContent.replace('Thang màu theo tài liệu cô','Thang màu hiển thị');if(!advanced&&state.mode==='real'&&$('#displayMode').value==='zones'&&!$('#landcover').checked){const note=el('small','Xám / nét đứt: thiếu giá trị hoặc độ phủ dưới 50%; không tô theo trung bình ít mẫu.');$('#legendContent').append(note);}};
  const priorRender=render;
  render=function(){priorRender();sync();};
  function sync(){
    const ready=advanced||policy.ready(state);document.body.classList.toggle('viewer-unavailable',!ready);loading.hidden=ready;
    loading.textContent=state.baseProduct&&!state.recoveredProduct?'Chưa tải được bộ hiện trạng đã bổ sung 2025. Không tự thay bằng nguồn cũ. Xem Dữ liệu & phương pháp để kiểm tra.':state.researchLoadError?'Chưa tải được dữ liệu hiện trạng. Kiểm tra máy chủ và tải lại trang.':'Đang tải bộ ảnh hiện trạng 2020–2025…';
    status.textContent=advanced?'Nâng cao · '+(state.mode==='real'?activeSourceName():state.mode==='demo'?'Dữ liệu giả lập':'CSV bổ sung'):ready?'Ảnh vệ tinh · 2020–2025':'Đang kiểm tra dữ liệu…';
    if(!advanced){$('#datasetNotice').textContent=ready?'Hiện trạng mùa khô · Landsat 2020–2025':'Đang kiểm tra bộ ảnh hiện trạng…';$('#yearRange').textContent='2020–2025 · mùa khô';$('#scenarioSource').value=policy.canonicalSource;}
    help.textContent=explanations[state.index];
    const q=policy.summary(state.real.filter(r=>r.year===state.year),state.index);
    qualityHint.textContent=!ready?'Đang kiểm tra độ phủ; chưa hiển thị số đếm khi bộ hiện trạng chưa sẵn sàng.':$('#landcover').checked?'Đang xem lớp phủ đất 2021, không phải lớp chỉ số của năm chọn.':`${names[state.index]} · ${state.year}: ${q.adequate} khu vực phủ ≥50%; ${q.limited} khu vực ít mẫu${q.missing?'; '+q.missing+' thiếu giá trị':''}. Vùng không màu là thiếu mẫu hợp lệ, không phải 0.`;
    if(changeMode())qualityHint.textContent+=' Chênh lệch ảnh chỉ dùng ô hợp lệ ở cả hai năm; số độ phủ phía trên mô tả năm 2025, không phải số ô ghép cặp.';
    for(const layer of state.zones?.getLayers()||[])if(!layer._viewerTooltip){layer._viewerTooltip=true;layer.bindTooltip(()=>{const f=layer.feature;if(state.mode!=='real')return el('span',f.properties.full_name+' · '+f.id);const r=state.real.find(r=>r.code===f.id&&r.year===state.year),coverage=r?.[state.index+'_coverage'];return el('span',`${f.properties.full_name} · ${fmt(r?.[state.index])} ${specs[state.index].unit} · ${Number.isFinite(coverage)?'độ phủ '+(coverage*100).toFixed(1)+'%':'thiếu dữ liệu'}${policy.quality(r,state.index)==='limited'?' · ít mẫu':''}`);});}
    $('#viewerSourceQuality').textContent=policy.ready(state)?'Bộ hiện trạng 2020–2025 đã tải. Phần bổ sung năm 2025 giữ nguyên ô ảnh gốc; độ phủ vẫn khác nhau giữa khu vực.':advanced?'Đang đối chiếu nguồn nâng cao: '+activeSourceName()+'. Bảng năm dưới đây chỉ dùng bộ GEE đã bổ sung, không dùng dữ liệu demo.':loading.textContent;
    const yearRows=$('#viewerYearQuality');yearRows.replaceChildren();for(let year=2020;year<=2025;year++){const tr=el('tr');tr.append(el('td',String(year)));for(const k of ['lst','ndvi','tvdi']){const rows=state.recoveredRows?.filter(r=>r.year===year)||[];tr.append(el('td',rows.length?`${policy.summary(rows,k).adequate} / 167`:'Chưa tải'));}yearRows.append(tr);}
    const label=$('#qualityKpis div:first-child small');if(label)label.textContent='Có số liệu · chưa chắc phủ đủ';
  }
  window.addEventListener('researchchange',sync);
  for(const tab of ['map','data','report','sources','scenario'])$('#'+tab+'Tab').addEventListener('click',()=>{if(tab==='data')renderTable();sync();});
  // Rebind closures dynamically so asynchronous source switches retain the viewing policy.
  $('#tableSearch').oninput=()=>renderTable();$('#tableYear').onchange=()=>renderTable();
  $('#boundaries').addEventListener('change',()=>render());
  sync();
})();
