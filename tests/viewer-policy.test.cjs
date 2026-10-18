const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../public/viewer-policy.js');
const fs=require('node:fs');
const path=require('node:path');
test('quality distinguishes sparse means, missing and unknown coverage',()=>{
  assert.equal(p.quality({lst:38,lst_coverage:.117694},'lst'),'limited');
  assert.equal(p.quality({lst:38,lst_coverage:.5},'lst'),'adequate');
  assert.equal(p.quality({lst:null,lst_coverage:.9},'lst'),'missing');
  assert.equal(p.quality({lst:38,lst_coverage:null},'lst'),'unknown');
  assert.equal(p.quality({lst:38,lst_coverage:1.3},'lst'),'unknown');
  assert.equal(p.eligible({lst:38,lst_coverage:null},'lst'),false);
});
test('167 means cannot be represented as 167 well covered regions',()=>{
  const rows=Array.from({length:167},(_,i)=>({lst:35+i/100,lst_coverage:i<100?.9:.1}));
  assert.deepEqual(p.summary(rows,'lst'),{available:167,adequate:100,limited:67,unknown:0,missing:0});
});
test('separate coverage of all three indices is respected, zero is valid',()=>{
  const r={lst:0,lst_coverage:.8,ndvi:0,ndvi_coverage:.2,tvdi:0,tvdi_coverage:1};
  assert.equal(p.quality(r,'lst'),'adequate');assert.equal(p.quality(r,'ndvi'),'limited');assert.equal(p.quality(r,'tvdi'),'adequate');
});
test('charts do not bridge missing or sparse years and never mutate research rows',()=>{
  const rows=[{year:2020,lst:35,lst_coverage:.8},{year:2021,lst:36,lst_coverage:.49},{year:2022,lst:37,lst_coverage:.8},{year:2023,lst:38,lst_coverage:.7},{year:2025,lst:39,lst_coverage:.6}];
  const original=JSON.stringify(rows);
  assert.deepEqual(p.chartSegments(rows,'lst').map(s=>s.map(r=>r.year)),[[2020],[2022,2023],[2025]]);
  assert.equal(JSON.stringify(rows),original);
});
test('viewer requires recovered GEE, never silently uses legacy, baseline or demo',()=>{
  for(const source of ['legacy','gee'])assert.equal(p.ready({researchSource:source,mode:'real',recoveredProduct:{},recoveredRows:[{}]}),false);
  assert.equal(p.ready({researchSource:'gee_recovery',mode:'real',recoveredProduct:{},recoveredRows:[{}]}),true);
  assert.equal(p.ready({researchSource:'gee_recovery',mode:'demo',recoveredProduct:{},recoveredRows:[{}]}),false);
  assert.equal(p.ready({researchSource:'gee_recovery',mode:'real',recoveredProduct:null,recoveredRows:null}),false);
});
test('published 2025 data retain nine sparse wards and a gap for Phu Loi',()=>{
  const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/gee_recovery/observations.json'),'utf8'));
  const year=rows.filter(r=>r.year===2025);
  assert.equal(p.summary(year,'lst').adequate,158);
  assert.equal(p.summary(year,'lst').limited,9);
  const ward=rows.filter(r=>r.code==='25750');
  assert.equal(p.quality(ward.find(r=>r.year===2025),'lst'),'limited');
  assert.equal(p.chartSegments(ward,'lst').flat().some(r=>r.year===2025),false);
  assert.equal(year.find(r=>r.code==='25750').lst_pixels,147);
});
