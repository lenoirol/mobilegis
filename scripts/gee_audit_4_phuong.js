/* Kiem ke canh Landsat cho 4 phuong con xam nam 2025 (Phu Loi, Binh Duong, Hoa Loi, Tan Khanh).
 * CHI DEM, khong xuat tep. Voi moi canh L2SP trong khoang ngay, in: ngay, may ca canh, so o hop le (quang hoc + nhiet)
 * trong 4 phuong, va so o hop le tai cho CON TRONG (chua canh nao da dung phu).
 * Chay trong GEE Code Editor bang tai khoan cua ban.
 */
var UNIT_ASSET = 'projects/mobilegis-510608/assets/hcm167_GEE';
var CODES = ['25750', '25760', '25849', '25891'];
var START = '2024-11-01', END = '2025-05-31';
var CRS = 'EPSG:32648';
var GRID = [120, 0, 644880, 0, -120, 1272720];
var USED_IDS = [
  'LC08_L2SP_124052_20250301_20250304_02_T1', 'LC09_L2SP_124053_20250205_20250206_02_T1',
  'LC08_L2SP_125052_20250204_20250208_02_T1', 'LC09_L2SP_125053_20250228_20250301_02_T1',
  'LC08_L2SP_124052_20250112_20250122_02_T1', 'LC08_L2SP_124053_20250112_20250122_02_T1',
  'LC09_L2SP_125052_20250228_20250301_02_T1', 'LC08_L2SP_125053_20250425_20250429_02_T1',
  'LC08_L2SP_124053_20250418_20250425_02_T1', 'LC08_L2SP_125052_20250220_20250226_02_T1',
  'LC08_L2SP_125053_20250119_20250128_02_T1'
];
var units = ee.FeatureCollection(UNIT_ASSET).map(function(f) {
  return f.set('code', ee.Number.parse(ee.String(f.get('code'))).format('%05d'));
});
var T = units.filter(ee.Filter.inList('code', CODES));
function joint(image) {
  var qa = image.select('QA_PIXEL');
  var red = image.select('SR_B4').multiply(0.0000275).subtract(0.2);
  var nir = image.select('SR_B5').multiply(0.0000275).subtract(0.2);
  var lst = image.select('ST_B10').multiply(0.00341802).add(149).subtract(273.15);
  var clear = qa.bitwiseAnd(63).eq(0).and(image.select('QA_RADSAT').eq(0));
  var optical = clear.and(red.gte(0)).and(red.lte(1)).and(nir.gte(0)).and(nir.lte(1)).and(red.add(nir).gt(0));
  return optical.and(lst.gte(-10)).and(lst.lte(70)).rename('good').unmask(0);
}
var all = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filterBounds(T.geometry()).filterDate(START, END).filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'));
var covered = all.filter(ee.Filter.inList('LANDSAT_PRODUCT_ID', USED_IDS)).map(joint).max();
var gap = covered.eq(0);
var total = ee.Image.constant(1).clipToCollection(T).reduceRegion({reducer: ee.Reducer.sum().unweighted(),
  geometry: T.geometry(), crs: CRS, crsTransform: GRID, maxPixels: 1e8}).get('constant');
var gapTotal = gap.clipToCollection(T).reduceRegion({reducer: ee.Reducer.sum().unweighted(),
  geometry: T.geometry(), crs: CRS, crsTransform: GRID, maxPixels: 1e8}).get('good');
var rows = ee.FeatureCollection(all.map(function(raw) {
  var g = joint(raw).clipToCollection(T);
  var inT = g.reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: T.geometry(), crs: CRS, crsTransform: GRID, maxPixels: 1e8, tileScale: 4}).get('good');
  var inGap = g.updateMask(gap).reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: T.geometry(), crs: CRS, crsTransform: GRID, maxPixels: 1e8, tileScale: 4}).get('good');
  return ee.Feature(null, {id: raw.get('LANDSAT_PRODUCT_ID'), cloud: raw.get('CLOUD_COVER'), valid_in_4: inT, fills_gap: inGap,
    used: ee.List(USED_IDS).contains(raw.get('LANDSAT_PRODUCT_ID'))});
}));
ee.Dictionary({total: total, gap_left: gapTotal, rows: rows.sort('id').toList(100).map(function(f) {
  f = ee.Feature(f);
  return ee.String(f.get('id')).slice(0, 4).cat(' ').cat(ee.String(f.get('id')).slice(10, 16)).cat(' ')
    .cat(ee.String(f.get('id')).slice(17, 25)).cat(' may=').cat(ee.Number(f.get('cloud')).format('%.0f'))
    .cat(' hop_le=').cat(ee.Number(f.get('valid_in_4')).format('%d'))
    .cat(' lap_cho_trong=').cat(ee.Number(f.get('fills_gap')).format('%d'))
    .cat(ee.Algorithms.If(f.get('used'), ' (da dung)', ''));
})}).evaluate(function(r, err) {
  if (err) { print('LOI: ' + err); return; }
  print('Tong o 4 phuong: ' + r.total + ' | con trong (chua canh nao da dung phu): ' + r.gap_left);
  print(r.rows.join('\n'));
});
