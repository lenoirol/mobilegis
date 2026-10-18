/* GEE and legacy sources are separate: never fill an unavailable GEE year. */
state.researchSource='gee';
function isGeeSource(){return state.researchSource!=='legacy';}
function activeSourceName(){return state.researchSource==='gee_recovery'?'GEE · đã bổ sung 5 phường năm 2025':state.researchSource==='gee'?'GEE · bản gốc, 2025 còn thiếu 5 phường':'USGS / Planetary Computer · bộ xử lý cũ';}
function geeRasterLink(year){return state.researchSource==='gee_recovery'&&year===2025?'/api/gee_recovery/rasters/indices_2025_recovery_batch1_120m.tif':`/api/gee/rasters/indices_${year}_120m.tif`;}
function activeYears(){return state.manifest.years.map(y=>y.year);}
window.applyResearchSource=function(source){
  if(!state.legacyReal)return;
  if(source==='gee'&&!state.gee){return;}
  if(source==='gee_recovery'&&!state.recoveredProduct)return;
  if(state.baseProduct){state.gee=source==='gee_recovery'?state.recoveredProduct:state.baseProduct;state.geeRows=source==='gee_recovery'?state.recoveredRows:state.baseRows;}
  stopPlay();$('#sampleInfo').textContent='';state.sampleRequest=(state.sampleRequest||0)+1;state.researchSource=source;
  state.real=isGeeSource()?state.geeRows:state.legacyReal;
  state.manifest=isGeeSource()?{years:state.gee.available_years.map(year=>({year,layers:Object.fromEntries(['lst','ndvi','tvdi'].map(k=>[k,{geotiff:geeRasterLink(year)}]))}))}:state.legacyManifest;
  state.visual=isGeeSource()?{...state.gee,context:{...state.legacyVisual?.context,...state.gee.context}}:state.legacyVisual;
  state.cover=isGeeSource()?state.geeCover:state.legacyCover;
  if(!activeYears().includes(state.year)){state.year=Math.max(...activeYears());$('#year').value=state.year;}
  if(!state.visual?.change?.lst){$('#displayMode').value='raster';$('#compare').checked=false;}
  $('#researchSource').value=source;$('#tableResearchSource').value=source;$('#tableYear').value='all';
  renderBase();render();renderTable();
};
$('#researchSource').onchange=e=>window.applyResearchSource(e.target.value);
$('#tableResearchSource').onchange=e=>window.applyResearchSource(e.target.value);
const sourceRender=render,sourceDetail=renderDetail,sourceTable=renderTable,sourceLegend=renderLegend;
render=function(){
  if(!state.legacyReal&&state.real.length){state.legacyReal=state.real;state.legacyManifest=state.manifest;if(state.gee&&isGeeSource())return window.applyResearchSource(state.recoveredProduct?'gee_recovery':'gee');}
  sourceRender();
  const isGee=isGeeSource(),research=state.mode==='real',years=activeYears();
  $('#researchSource').disabled=!research;$('#tableResearchSource').disabled=!research;
  $('#sourceAvailability').textContent=research?`${activeSourceName()}. Có: ${years.join(', ')}.${isGee&&state.gee?.pending_years.length?' Chờ xuất: '+state.gee.pending_years.join(', ')+'. Không trộn số liệu nguồn cũ.':''}`:'';
  if(research){$('#datasetNotice').textContent=`${activeSourceName()} · 120 m · TVDI thử nghiệm`;$('#yearRange').textContent=isGee?(state.gee?.pending_years.length?'Năm chưa xuất sẽ để trống':`${years[0]}–${years.at(-1)} · GEE`):'2020–2025 · nguồn xử lý cũ';}
  if(research&&isGee&&$('#landcover').checked){const size=$('#mapSummary>div:nth-child(3) strong');if(size)size.textContent='10 m thống kê';}
  $('#play').disabled=research&&years.length<2;
  const paired=!!state.visual?.change?.lst;
  $('#displayMode').querySelector('option[value="change"]').disabled=research&&!paired;
  $('#compare').disabled=!research||!state.visual?.absolute?.['2020'];
  if(research&&!years.includes(state.year)&&!$('#landcover').checked){$('#rasterStatus').textContent=`Chưa có dữ liệu ${isGee?'GEE ':''}năm ${state.year}. Không thay bằng dữ liệu nguồn khác.`;$('#rasterStatus').hidden=false;}
  for(const select of [$('#insightYear')].filter(Boolean))for(const option of select.options){option.disabled=!years.includes(Number(option.value));}
  if($('#insightYear')&&!years.includes(Number($('#insightYear').value))){$('#insightYear').value=String(Math.max(...years));window.dispatchEvent(new Event('researchchange'));}
  // The server/database status owns versionTag; GEE7 is a data-processing version.
};
renderDetail=function(){
  sourceDetail();if(state.mode!=='real')return;
  const cover=state.cover?.find(c=>c.code===state.selected),list=$('#landcoverDetail .cover-list');
  if(cover&&list){list.replaceChildren();for(const c of [...cover.classes].sort((a,b)=>b.percent-a.percent).filter(c=>c.percent>0).slice(0,3))list.append(el('span',`${c.name}: ${c.percent.toFixed(1)}%`));}
  const gee=isGeeSource();
  if(gee){
    $('#downloadRaster').hidden=!$('#landcover').checked&&!activeYears().includes(state.year);
    $('#downloadRaster').href=$('#landcover').checked?'/api/gee/rasters/worldcover_2021_10m.tif':changeMode()?`/api/${state.researchSource}/rasters/change_${state.index}_2020_2025_120m.tif`:geeRasterLink(state.year);
    $('#downloadRaster').textContent=$('#landcover').checked?'Tải WorldCover 2021 · GeoTIFF gốc lưới 10 m':changeMode()?'Tải GeoTIFF chênh lệch GEE':'Tải GeoTIFF GEE · 3 lớp NDVI / LST / TVDI';
    const row=selectedRow();$('#source').textContent=row?`GEE · ngày cảnh toàn bộ mosaic: ${row.dates.join(', ')}. Không phải mọi cảnh đều phủ đơn vị này. Trung bình ô có tâm trong ranh giới; không phải trung bình năm.`:`GEE năm ${state.year}: chưa có bản xuất. Không nội suy từ nguồn khác.`;
    if(changeMode()&&row){const first=state.real.find(r=>r.code===state.selected&&r.year===2020);$('#source').textContent=`GEE · cảnh 2020: ${first?.dates.join(', ')||'thiếu'}; cảnh 2025: ${row.dates.join(', ')}. Bản đồ trừ từng cặp ô hợp lệ cùng vị trí; Δ trung bình vùng dùng các tập ô hợp lệ riêng. Không phải xu thế khí hậu hay quan hệ nhân quả.`;}
    if(row?.recovery_pixels)$('#source').textContent+=` Bổ sung ${row.recovery_pixels} ô từ cảnh ${row.recovery_dates.join(', ')}; ô gốc giữ nguyên. LST là nhiệt độ bề mặt, không phải nhiệt độ không khí.`;
    const heading=$('#landcoverDetail h3');if(heading)heading.textContent='Lớp phủ đất 2021 · thống kê lưới 10 m';
  }
};
renderLegend=function(){
  sourceLegend();if(state.mode==='real'&&isGeeSource()&&$('#landcover').checked){const small=$('#legend small');if(small)small.textContent='GEE WorldCover · hiển thị ~30 m, thống kê 10 m';}
  const legend=$('#legend'),content=el('div'),toggle=el('button');content.id='legendContent';content.append(...legend.childNodes);
  toggle.type='button';toggle.className='legend-toggle';toggle.setAttribute('aria-controls','legendContent');
  function sync(){content.hidden=!!state.legendCollapsed;toggle.textContent=state.legendCollapsed?'＋ Hiện chú giải':'− Thu gọn chú giải';toggle.setAttribute('aria-expanded',String(!state.legendCollapsed));legend.classList.toggle('is-collapsed',!!state.legendCollapsed);}
  toggle.onclick=()=>{state.legendCollapsed=!state.legendCollapsed;sync();};legend.replaceChildren(toggle,content);sync();
};
renderTable=function(){sourceTable();if(state.mode==='real'){$('#tableNotice').textContent=`${activeSourceName()}. Ngưỡng ≥5 pixel và ≥10% độ phủ; ô trống không phải 0. Các phiên bản được giữ riêng.`;$('#export').href=isGeeSource()?`/data/${state.researchSource}/observations.csv`:'/data/observations_real.csv';}};
// Rebind handlers that previously captured the legacy renderer function.
$('#tableSearch').oninput=()=>renderTable();$('#tableYear').onchange=()=>renderTable();
$('#visible').onchange=()=>render();
extent=function(){
  if(state.mode==='real'&&state.zones){state.map.invalidateSize({animate:false});const width=state.map.getSize().x;const detailOpen=!$('#detailBody').hidden;state.map.fitBounds(state.zones.getBounds(),{animate:false,paddingTopLeft:[20,80],paddingBottomRight:innerWidth<=760?[20,detailOpen?Math.min(270,state.map.getSize().y*.4):70]:[detailOpen?Math.min(390,width*.4):25,35]});}
  else state.map?.setView([10.8,106.85],9);
};
$('#extent').onclick=()=>extent();
sampleAt=async function(point){
  const request=state.sampleRequest=(state.sampleRequest||0)+1;$('#sampleInfo').textContent='Đang tra cứu ô mẫu…';
  try{const source=state.researchSource;const r=await json(`/api/sample?lat=${point.lat}&lon=${point.lng}&year=${state.year}&index=${state.index}&change=${changeMode()?1:0}&source=${source}`);if(request!==state.sampleRequest)return;$('#sampleInfo').textContent=`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)} · ${activeSourceName()}: ${valid(r.value)?fmt(r.value)+' '+specs[state.index].unit:r.status==='unavailable'?'chưa có bản xuất cho năm này':'thiếu dữ liệu'}. Ô mẫu gần nhất 120 m, khác trung bình xã/phường.`;}catch{if(request===state.sampleRequest)$('#sampleInfo').textContent='Không tra cứu được; cần máy chủ cục bộ đang chạy.';}
};
const sourceCard=el('section');sourceCard.className='analysis-card';sourceCard.id='geeQuality';
sourceCard.innerHTML='<h2>Bộ xuất GEE đã kiểm tra</h2><p id="geeQualityText">Đang tải kết quả kiểm tra…</p><div id="geeYearProgress" class="toolbar"></div><div class="tableWrap"><table><thead><tr><th>Năm</th><th>Có LST / NDVI / TVDI</th><th>Ngày chụp các cảnh</th></tr></thead><tbody id="geeYearQuality"></tbody></table></div><p><a href="/data/gee/observations.csv" download>CSV GEE đã tính lại</a> · <a href="/data/gee/products.json" download>Metadata và kiểm tra nguồn</a> · <a href="/api/documents/gee_script.js" download>Script xuất GEE</a> · <a href="/api/documents/gee_next_years.md" download>Quy trình xuất 2020–2024</a></p><details><summary>File GEE gốc đã bảo toàn</summary><p id="geeOriginalDownloads"></p></details><p class="small muted">Tính lại số ô hợp lệ, tổng số ô và trung bình theo cùng quy tắc tâm pixel; không cắt tỷ lệ sai về 100%. TVDI thử nghiệm, không phải bản đồ cảnh báo hạn chính thức. WorldCover cố định năm 2021. Các cảnh khác ngày; chuỗi này không phải trung bình năm.</p>';
$('#sourcesView').prepend(sourceCard);
Promise.all([json('/data/gee/products.json'),json('/data/gee/observations.json'),json('/data/gee/landcover_stats.json'),json('/data/gee_recovery/products.json').catch(()=>null),json('/data/gee_recovery/observations.json').catch(()=>null)]).then(([baseline,baseRows,cover,recovered,recoveredRows])=>{
  if(!recoveredRows)recovered=null;
  state.baseProduct=baseline;state.baseRows=baseRows;state.recoveredProduct=recovered;state.recoveredRows=recoveredRows;
  const product=recovered||baseline,rows=recovered?recoveredRows:baseRows;
  state.gee=product;state.geeRows=rows;state.geeCover=cover;
  for(const id of ['researchSource','tableResearchSource','analysisResearchSource']){const select=$('#'+id);if(select&&recovered){const option=el('option','GEE · đã bổ sung 2025');option.value='gee_recovery';select.prepend(option);}}
  const full=product.available_years.length===6;
  for(const id of ['researchSource','tableResearchSource','analysisResearchSource']){const option=$('#'+id)?.querySelector('option[value="gee"]');if(option)option.textContent='GEE · bản gốc, thiếu 5 phường 2025';}
  $('#geeQualityText').textContent=`Đã nhập ${product.available_years.length} năm GEE, ${rows.length} dòng thống kê. Độ phủ tính lại 0–100%; dữ liệu gốc giữ nguyên. ${full?'Đã có chuỗi 2020–2025, bản đồ chênh lệch và so sánh cùng nguồn GEE.':'Các năm chưa xuất không được tự tạo.'}`;
  for(const year of product.available_years){const audit=product.audits[String(year)],tr=el('tr');for(const value of [year,`${audit.valid_means.lst} / ${audit.valid_means.ndvi} / ${audit.valid_means.tvdi} trên 167`,[...new Set(audit.scenes.map(s=>s.acquisition_date))].sort().join(', ')])tr.append(el('td',value));$('#geeYearQuality').append(tr);}
  for(let y=2020;y<=2025;y++){const item=el('span',`${y}: ${product.available_years.includes(y)?'đã nhập':'chờ xuất'}`);item.className=product.available_years.includes(y)?'source-ready':'source-pending';$('#geeYearProgress').append(item);}
  for(const audit of Object.values(product.audits))for(const original of audit.original_files){const link=el('a',original.file);link.href=original.download;link.download=original.file;$('#geeOriginalDownloads').append(link,el('br'));}
  if(recovered){const note=el('p','Các ngày trong bảng gồm cả cảnh ứng viên. Phần bổ sung thực dùng 6.324 ô từ LC09 path/row 125/052 ngày 28/02/2025 và 1 ô từ LC08 path/row 124/052 ngày 12/01/2025. Hai ứng viên còn lại không thêm ô.');$('#geeYearQuality').closest('.tableWrap').after(note);}
  if(recovered){$('#geeQualityText').textContent+=' Đã bổ sung 6.325 ô thực năm 2025: 167/167 đơn vị có đủ ba chỉ số. Bản GEE gốc còn nguyên, có thể chọn để đối chiếu.';const links=$('#geeQuality a[href="/data/gee/observations.csv"]');links.href='/data/gee_recovery/observations.csv';$('#geeQuality a[href="/data/gee/products.json"]').href='/data/gee_recovery/products.json';const detail=el('details');detail.innerHTML='<summary>Độ phủ 5 phường trước / sau bổ sung</summary>';for(const w of recovered.recovery.wards)detail.append(el('p',`${w.name}: LST ${(w.before.lst_coverage*100).toFixed(1)}% → ${(w.after.lst_coverage*100).toFixed(1)}%; NDVI ${(w.after.ndvi_coverage*100).toFixed(1)}%; TVDI ${(w.after.tvdi_coverage*100).toFixed(1)}%.`));$('#geeQualityText').after(detail);}
  window.applyResearchSource(recovered?'gee_recovery':'gee');
}).catch(e=>{state.researchLoadError=e.message;state.researchSource='legacy';$('#researchSource').options[0].disabled=true;$('#geeQualityText').textContent='Chưa tải được bộ GEE: '+e.message;window.applyResearchSource('legacy');});
