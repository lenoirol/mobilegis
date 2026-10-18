/* Presentation rules only. Never fill, rewrite or interpolate research observations. */
(function(root){
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const threshold=.5;
  function quality(row,index){
    if(!finite(row?.[index]))return 'missing';
    const coverage=row[index+'_coverage'];
    if(!finite(coverage)||coverage<0||coverage>1)return 'unknown';
    return coverage<threshold?'limited':'adequate';
  }
  function eligible(row,index,min=threshold){
    return finite(row?.[index])&&finite(row[index+'_coverage'])&&row[index+'_coverage']>=min&&row[index+'_coverage']<=1;
  }
  function summary(rows,index){
    return {available:rows.filter(r=>finite(r[index])).length,adequate:rows.filter(r=>eligible(r,index)).length,limited:rows.filter(r=>quality(r,index)==='limited').length,unknown:rows.filter(r=>quality(r,index)==='unknown').length,missing:rows.filter(r=>quality(r,index)==='missing').length};
  }
  function chartSegments(rows,index,years=[2020,2021,2022,2023,2024,2025]){
    const segments=[];let segment=[];
    for(const year of years){const row=rows.find(r=>r.year===year);if(eligible(row,index))segment.push(row);else if(segment.length){segments.push(segment);segment=[];}}
    if(segment.length)segments.push(segment);return segments;
  }
  const api={threshold,quality,eligible,summary,chartSegments,canonicalSource:'gee_recovery',ready:s=>!!s.recoveredProduct&&!!s.recoveredRows?.length&&s.researchSource==='gee_recovery'&&s.mode==='real'};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ViewerPolicy=api;
})(typeof window==='object'?window:globalThis);
