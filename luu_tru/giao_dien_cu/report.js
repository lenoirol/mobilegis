/* Report evidence is separate from both the research rasters and CSV values. */
(() => {
  const q = s => document.querySelector(s);
  const main = document.createElement('main');
  main.id = 'reportView'; main.className = 'page'; main.hidden = true;
  main.innerHTML = `
    <span class="eyebrow">KHÔNG GIAN VÀ THỜI GIAN</span><h1>Phân tích và minh chứng báo cáo</h1>
    <p>Khám phá thống kê Landsat của 167 xã/phường, so sánh chuỗi 2020–2025, đối chiếu bốn điểm CSV và xem ảnh Google Earth Engine do nhóm cung cấp. Hỗ trợ mục 8.3 và 8.5 của đề cương.</p>
    <p class="notice">Hai nguồn độc lập: biểu đồ tương tác lấy số từ CSV nhóm cung cấp, không chép số từ ảnh. Đường biểu diễn trong ảnh có dấu hiệu khác CSV; chưa có script GEE để xác định nguyên nhân. Không coi hai nguồn đã khớp hoặc dùng ảnh thay các lớp Landsat 167 đơn vị.</p>
    <section class="analysis-card"><h2>So sánh bốn điểm từ CSV</h2>
    <p>Nguồn khai báo: GEE Landsat 8/9 Collection 2 Level 2, mùa khô. Chưa tái kiểm chứng quy trình; không phải trung bình xã/phường.</p>
    <label for="comparisonIndex">Chỉ số so sánh</label><select id="comparisonIndex"><option value="lst">LST · Nhiệt độ bề mặt °C</option><option value="ndvi">NDVI · Chỉ số thực vật</option><option value="tvdi">TVDI · Mức khô tương đối</option></select>
    <fieldset id="comparisonPoints"><legend>Điểm cần hiển thị</legend></fieldset>
    <p id="comparisonStatus" role="status">Đang tải dữ liệu…</p>
    <div class="comparison-scroll"><svg id="comparisonChart" viewBox="0 0 900 490" role="img" aria-label="So sánh chỉ số bốn điểm từ 2020 đến 2025"></svg></div>
    <p id="comparisonExplain"></p><div class="toolbar"><button id="downloadComparison" disabled>Tải biểu đồ SVG</button><a class="button" href="/data/user_supplied_original.csv" download>Tải CSV nguyên gốc</a></div>
    <h3>Giá trị đầu kỳ và cuối kỳ</h3><p>Chênh lệch = 2025 trừ 2020, tính từ số gốc rồi mới làm tròn nên có thể lệch 0,01 so với phép trừ hai số đang hiển thị. NDVI và TVDI là chênh lệch tuyệt đối, không phải phần trăm. Hai mốc không đại diện cho xu hướng toàn chuỗi.</p>
    <div class="tableWrap"><table><thead><tr><th>Điểm</th><th>2020</th><th>2025</th><th>Chênh lệch</th></tr></thead><tbody id="comparisonRows"></tbody></table></div>
    <details><summary>Số liệu từng năm và cách đọc biểu đồ</summary><p>Chạm hoặc đưa chuột lên điểm biểu đồ để xem số; có thể đọc bảng thay thế bên dưới. Trục ngang là năm. Đoạn nối chỉ giúp theo dõi, không phải quan trắc liên tục hoặc dự báo. Dữ liệu thiếu được để trống và không nối qua khoảng thiếu.</p><div class="tableWrap"><table><thead><tr><th>Điểm</th><th>Năm</th><th>Giá trị</th></tr></thead><tbody id="comparisonAllRows"></tbody></table></div></details></section>
    <section><h2>Thư viện ảnh GEE do nhóm cung cấp</h2><p>Ảnh bản đồ ghi “Ranh giới pilot - TPHCM cu”, khác phạm vi TP.HCM sau sáp nhập. Ảnh không có chú giải số đầy đủ: chỉ mô tả tương phản màu quan sát được, không suy ra giá trị hay cấp hạn từ màu. Giữ nguyên ảnh và thông tin nguồn hiển thị.</p><div id="evidenceGallery" class="evidence-grid"></div></section>
    <section class="analysis-card"><h2>Sử dụng trong báo cáo</h2><ol><li>Chọn chỉ số và điểm rồi tải SVG. Ghi nguồn CSV, giai đoạn 2020–2025 và giới hạn chưa tái kiểm chứng.</li><li>Dùng ảnh GEE minh chứng bước xử lý và hiển thị thí điểm. Ghi phạm vi “TP.HCM cũ”, không ghi toàn bộ 167 đơn vị.</li><li>Với phạm vi nghiên cứu mở rộng, dùng tab Bản đồ và bộ Landsat thực, kèm ngày ảnh, lưới 120 m và độ phủ.</li><li>Đối chiếu script GEE, ngày ảnh, tọa độ hoặc vùng đệm, cách tổng hợp mùa khô và phương pháp TVDI trước khi kết luận hai nguồn tương đương.</li></ol><p>JPG không phải lớp bản đồ có tọa độ. Để chồng kết quả GEE đúng vị trí cần GeoTIFF, hệ tọa độ, ngày ảnh và giá trị NoData; không kéo giãn ảnh chụp thành lớp số liệu.</p></section>
    <dialog id="evidenceDialog" aria-labelledby="evidenceDialogTitle"><button id="closeEvidence" autofocus>Đóng ảnh</button><h2 id="evidenceDialogTitle"></h2><img id="evidenceFull" alt=""><p id="evidenceCaption"></p><a id="evidenceDownload" download>Tải ảnh gốc</a></dialog>`;
  q('#editor').before(main);
  const tab = document.createElement('button'); tab.id = 'reportTab'; tab.textContent = 'Phân tích';
  q('#sourcesTab').before(tab);
  for (const name of ['map','data','report','sources']) q('#'+name+'Tab').onclick = () => {
    stopPlay();
    for (const t of ['map','data','report','sources']) {q('#'+t+'View').hidden=t!==name;q('#'+t+'Tab').classList.toggle('active',t===name);}
    window.scrollTo(0,0);
    if(name==='map')setTimeout(()=>state.map?.invalidateSize(),30);
  };
  const evidence = [
    ['gee-ndvi-chart.jpg','Biểu đồ NDVI mùa khô 2020–2025','Bốn đường diễn biến có mức xanh tương đối khác nhau và dao động qua các năm. Chú giải bị cắt, không đủ để gán chắc chắn mọi màu cho từng điểm. Đây là ảnh tham khảo, không phải nguồn số của biểu đồ tương tác.'],
    ['gee-lst-chart.jpg','Biểu đồ LST mùa khô 2020–2025','Các đường nhiệt độ bề mặt biến động không đồng nhất, có tăng và giảm giữa các mốc. Không đọc ra số chính xác từ ảnh hoặc kết luận xu hướng nóng lên chỉ bằng hai điểm đầu cuối.'],
    ['gee-lst-map-2025.jpg','Bản đồ LST năm 2025 trên GEE','Lớp LST được bật; vùng trung tâm có nhiều màu nóng, vùng phía nam có màu lạnh hơn. Không có thang số đầy đủ trong ảnh để định lượng. Phạm vi lớp pilot là TP.HCM cũ.'],
    ['gee-ndvi-map-2025.jpg','Bản đồ NDVI năm 2025 trên GEE','Lớp NDVI được bật; vùng phía nam nổi bật với màu xanh đậm, vùng trung tâm có màu nhạt hơn. Cần chú giải gốc và dữ liệu để xác nhận ngưỡng NDVI; không coi màu là phần trăm che phủ.'],
    ['gee-tvdi-map-2025.jpg','Bản đồ TVDI thử nghiệm năm 2025','Tên lớp ghi rõ thử nghiệm. Màu đỏ và xanh thể hiện tương phản hiển thị, chưa đủ kết luận cấp hạn hán hoặc độ ẩm đất. Cần kiểm tra cách xây dựng rìa ướt và rìa khô trong script GEE.']
  ];
  for(const [file,title,caption] of evidence){
    const card=el('article');card.className='evidence-card';const button=el('button');button.className='evidence-open';button.setAttribute('aria-label','Mở ảnh '+title);
    const img=el('img');img.src='/data/evidence/'+file;img.alt=title;img.loading='lazy';button.append(img);
    card.append(button,el('h3',title),el('p',caption));q('#evidenceGallery').append(card);
    button.onclick=()=>{q('#evidenceDialogTitle').textContent=title;q('#evidenceFull').src=img.src;q('#evidenceFull').alt=title;q('#evidenceCaption').textContent=caption;q('#evidenceDownload').href=img.src;q('#evidenceDialog').showModal();};
  }
  q('#closeEvidence').onclick=()=>q('#evidenceDialog').close();
  const palette=['#1264a3','#ba3d24','#087b68','#8b4caa'];let rows=[],names=[];
  const cfg={lst:{label:'LST',unit:'°C',lo:20,hi:50,note:'LST là nhiệt độ bề mặt, không phải nhiệt độ không khí. Trục 20–50 °C để đối chiếu cùng thang qua các điểm.'},ndvi:{label:'NDVI',unit:'không đơn vị',lo:-1,hi:1,note:'NDVI biểu thị mức xanh tương đối, không phải phần trăm thảm thực vật. Trục cố định từ −1 đến 1.'},tvdi:{label:'TVDI',unit:'không đơn vị',lo:0,hi:1,note:'TVDI là mức khô tương đối theo phương pháp tính. Chưa kiểm chứng script của CSV; giá trị 1 không tự chứng minh hạn hán. Trục từ 0 đến 1.'}};
  function renderComparison(){
    const k=q('#comparisonIndex').value,c=cfg[k],svg=q('#comparisonChart'),selected=[...q('#comparisonPoints').querySelectorAll('input:checked')].map(x=>x.value);
    svg.replaceChildren();q('#comparisonRows').replaceChildren();q('#comparisonAllRows').replaceChildren();q('#comparisonExplain').textContent=c.note;
    q('#downloadComparison').disabled=!selected.length;q('#comparisonStatus').textContent=selected.length?`${selected.length} điểm · CSV nhóm cung cấp · số liệu gốc giữ nguyên`:'Chọn ít nhất một điểm để xem biểu đồ.';
    const add=(tag,attrs,text)=>{const n=svgNode(tag,attrs,text);svg.append(n);return n;};
    add('rect',{width:900,height:490,fill:'#fff'});add('text',{x:60,y:27,'font-size':19,'font-weight':700},`${c.label} tại các điểm đại diện · 2020–2025`);
    add('text',{x:60,y:49,'font-size':13},`Nguồn: CSV nhóm cung cấp · ${c.unit} · chưa tái kiểm chứng GEE`);
    const values=rows.filter(r=>selected.includes(r.name)).map(r=>r[k]).filter(valid);
    const lo=Math.min(c.lo,...values),hi=Math.max(c.hi,...values);const y=v=>340-(v-lo)/(hi-lo)*250,x=yr=>85+(yr-2020)*151;
    for(let i=0;i<=5;i++){let v=lo+(hi-lo)*i/5,cy=y(v);add('line',{x1:85,x2:840,y1:cy,y2:cy,stroke:'#dce6e4'});add('text',{x:75,y:cy+5,'text-anchor':'end','font-size':13},fmt(v,k==='lst'?0:2));}
    for(let yr=2020;yr<=2025;yr++)add('text',{x:x(yr),y:365,'text-anchor':'middle','font-size':13},String(yr));
    selected.forEach((name,i)=>{const color=palette[names.indexOf(name)%palette.length];let last=null;
      for(let yr=2020;yr<=2025;yr++){const r=rows.find(r=>r.name===name&&r.year===yr);const tr=el('tr');[name,yr,fmt(r?.[k])].forEach(v=>tr.append(el('td',v)));q('#comparisonAllRows').append(tr);if(!valid(r?.[k])){last=null;continue;}const cx=x(yr),cy=y(r[k]);if(last)add('line',{x1:last.cx,y1:last.cy,x2:cx,y2:cy,stroke:color,'stroke-width':2.5,'stroke-dasharray':names.indexOf(name)%2?'7 3':'none'});const dot=add('circle',{cx,cy,r:5,fill:color,tabindex:0,role:'button','aria-label':`${name}, ${yr}: ${fmt(r[k])} ${c.unit}`});dot.append(svgNode('title',{},`${name} · ${yr}: ${fmt(r[k])}`));const show=()=>q('#comparisonStatus').textContent=`${name} · ${yr}: ${fmt(r[k])} ${c.unit} · nguồn CSV`;dot.onclick=show;dot.onfocus=show;dot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}};last={cx,cy};}
      const a=rows.find(r=>r.name===name&&r.year===2020)?.[k],b=rows.find(r=>r.name===name&&r.year===2025)?.[k],d=valid(a)&&valid(b)?b-a:null;
      const tr=el('tr');[name,fmt(a),fmt(b),valid(d)?(d>0?'+':'')+fmt(d):'—'].forEach(v=>tr.append(el('td',v)));q('#comparisonRows').append(tr);
      const lx=65+(i%2)*420,ly=395+Math.floor(i/2)*26;add('line',{x1:lx,x2:lx+25,y1:ly-4,y2:ly-4,stroke:color,'stroke-width':3});add('text',{x:lx+35,y:ly,'font-size':14},name);
    });
    add('text',{x:60,y:460,'font-size':12},'Giá trị tại tọa độ CSV, không phải trung bình xã/phường. Đoạn nối không phải dự báo.');
  }
  q('#comparisonIndex').onchange=renderComparison;
  q('#downloadComparison').onclick=()=>{const clone=q('#comparisonChart').cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','900');clone.setAttribute('height','490');clone.setAttribute('font-family','Arial, sans-serif');const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));const a=el('a');a.href=url;a.download=`MobileGIS_CSV_${q('#comparisonIndex').value}_2020_2025.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  json('/data/observations_user.json').then(data=>{rows=data;names=[...new Set(rows.map(r=>r.name))];for(const name of names){const label=el('label'),input=el('input');input.type='checkbox';input.value=name;input.checked=true;input.onchange=renderComparison;label.append(input,document.createTextNode(name));q('#comparisonPoints').append(label);}renderComparison();}).catch(()=>{q('#comparisonStatus').textContent='Không tải được dữ liệu CSV. Hãy kết nối lại máy chủ và tải lại trang. Ảnh minh chứng vẫn có thể xem nếu đã tải.';});
})();
