/* Bo sung o thieu cho cac nam 2020, 2022, 2023 (cung cach lam nhu cac dot bo sung 2025).
 * KHONG thay du lieu da co. Cung mua (thang 1-4 cua nam do), cung mat na chat luong, luoi 120 m,
 * TVDI tinh rieng cho tung canh, chi lap o TRONG HOAN TOAN cua bo ba LST-NDVI-TVDI, bo ba lay tu CUNG MOT canh.
 * Canh ung vien: cung mua, KHONG thuoc 4 canh cua ban xuat goc nam do, xep theo so o lap duoc o cho trong (toi da 4 canh).
 * Moi nam xuat 2 tep: MobileGIS_fill_<nam>_120m.tif (5 bang) va MobileGIS_fill_<nam>_scenes.csv.
 * Kiem tra va tinh lai trung binh xa/phuong tren may bang scripts/review_gee_fill_year.py.
 */
var UNIT_ASSET = 'projects/mobilegis-510608/assets/hcm167_GEE';
var FOLDER = 'MobileGIS_GEE_fill_years';
var SCALE = 120, CRS = 'EPSG:32648';
var GRID = [120, 0, 644880, 0, -120, 1272720];
var MAX_CLOUD = 60;           // loc theo may ca canh; may tung o van bi mat na loai bo
var JOBS = [
  {year: 2020, targets: ['26545', '27559'],
   base: ['LC08_L2SP_124052_20200115_20200824_02_T1', 'LC08_L2SP_124053_20200115_20200823_02_T1', 'LC08_L2SP_125052_20200223_20200822_02_T1', 'LC08_L2SP_125053_20200223_20200822_02_T1']},
  {year: 2022, targets: ['26506', '26545', '26566', '26596', '26608', '26632', '26647', '26662', '26704', '26725', '26728', '27676'],
   base: ['LC08_L2SP_124052_20220120_20220127_02_T1', 'LC08_L2SP_124053_20220325_20220330_02_T1', 'LC09_L2SP_125052_20220119_20230501_02_T1', 'LC08_L2SP_125053_20220111_20220122_02_T1']},
  {year: 2023, targets: ['26596', '26608'],
   base: ['LC08_L2SP_124052_20230224_20230301_02_T1', 'LC08_L2SP_124053_20230224_20230301_02_T1', 'LC08_L2SP_125052_20230319_20230324_02_T1', 'LC09_L2SP_125053_20230311_20230313_02_T1']}
];

var units = ee.FeatureCollection(UNIT_ASSET).map(function(f) {
  return f.set('code', ee.Number.parse(ee.String(f.get('code'))).format('%05d'));
}).filter(ee.Filter.neq('code', '26732'));
var region = ee.Geometry.Rectangle([644880, 1141080, 781800, 1272720], CRS, false);
var roi = units.bounds(100);

function masks(image) {
  var qa = image.select('QA_PIXEL');
  var red = image.select('SR_B4').multiply(0.0000275).subtract(0.2);
  var nir = image.select('SR_B5').multiply(0.0000275).subtract(0.2);
  var lst = image.select('ST_B10').multiply(0.00341802).add(149).subtract(273.15).rename('LST');
  var clear = qa.bitwiseAnd(63).eq(0).and(image.select('QA_RADSAT').eq(0));
  var optical = clear.and(red.gte(0)).and(red.lte(1)).and(nir.gte(0)).and(nir.lte(1)).and(red.add(nir).gt(0));
  var joint = optical.and(lst.gte(-10)).and(lst.lte(70));
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  return {qa: qa, joint: joint, ndvi: ndvi, lst: lst, common: ndvi.addBands(lst).updateMask(joint)};
}
function prepare(image, year) {
  var m = masks(image), ndvi = m.ndvi, lst = m.lst;
  var dryLand = m.common.updateMask(m.qa.bitwiseAnd(128).eq(0)).clipToCollection(units);
  var bins = ee.FeatureCollection(ee.List.sequence(0.1, 0.8, 0.05).map(function(start) {
    start = ee.Number(start);
    var inBin = dryLand.select('NDVI').gte(start).and(dryLand.select('NDVI').lt(start.add(0.05)));
    var stats = dryLand.select('LST').updateMask(inBin).reduceRegion({
      reducer: ee.Reducer.percentile([5, 95]).combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
      geometry: roi, crs: CRS, crsTransform: GRID, maxPixels: 1e9, tileScale: 4});
    return ee.Feature(null, {ndvi: start.add(0.025), wet: stats.get('LST_p5'), dry: stats.get('LST_p95'), count: stats.get('LST_count')});
  })).filter(ee.Filter.gte('count', 80)).filter(ee.Filter.notNull(['wet', 'dry']));
  var enough = bins.size().gte(6), empty = ee.Dictionary({scale: 0, offset: 0});
  var wetFit = ee.Dictionary(ee.Algorithms.If(enough, bins.reduceColumns(ee.Reducer.linearFit(), ['ndvi', 'wet']), empty));
  var dryFit = ee.Dictionary(ee.Algorithms.If(enough, bins.reduceColumns(ee.Reducer.linearFit(), ['ndvi', 'dry']), empty));
  var wet = ndvi.multiply(ee.Number(wetFit.get('scale'))).add(ee.Number(wetFit.get('offset')));
  var dry = ndvi.multiply(ee.Number(dryFit.get('scale'))).add(ee.Number(dryFit.get('offset')));
  var lower = ee.Number(ee.Algorithms.If(enough, bins.aggregate_min('ndvi'), 0)).subtract(0.025);
  var upper = ee.Number(ee.Algorithms.If(enough, bins.aggregate_max('ndvi'), 0)).add(0.025);
  var tvdi = lst.subtract(wet).divide(dry.subtract(wet)).clamp(0, 1).rename('TVDI')
    .updateMask(m.joint.and(m.qa.bitwiseAnd(128).eq(0)).and(dry.subtract(wet).gt(2))
      .and(ndvi.gte(lower)).and(ndvi.lt(upper)).and(ee.Image.constant(ee.Number(ee.Algorithms.If(enough, 1, 0)))));
  var triplet = m.common.addBands(tvdi);
  var jointMask = triplet.mask().reduce(ee.Reducer.min());        // ca ba bang tu cung mot canh
  var day = image.date().getRelative('day', 'year').add(1);
  return triplet.addBands(ee.Image.constant(ee.Number(image.get('scene_index'))).rename('scene_index'))
    .addBands(ee.Image.constant(day).rename('day_of_year')).updateMask(jointMask).toFloat()
    .copyProperties(image, image.propertyNames()).set({year: year, resolution_m: SCALE,
      acquisition_date: image.date().format('YYYY-MM-dd'), day_of_year: day, tvdi_bins: bins.size(),
      wet_slope: wetFit.get('scale'), wet_intercept: wetFit.get('offset'), dry_slope: dryFit.get('scale'), dry_intercept: dryFit.get('offset'),
      tvdi_status: ee.Algorithms.If(enough, 'experimental_fit', 'insufficient_bins')});
}

JOBS.forEach(function(job) {
  var Y = job.year, targets = units.filter(ee.Filter.inList('code', job.targets));
  var all = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(roi).filterDate(Y + '-01-01', Y + '-05-01').filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'));
  var covered = all.filter(ee.Filter.inList('LANDSAT_PRODUCT_ID', job.base)).map(function(raw) {
    return masks(raw).joint.rename('ok').unmask(0).toByte(); }).max().rename('covered');
  var gap = covered.eq(0);
  var ranked = all.filter(ee.Filter.inList('LANDSAT_PRODUCT_ID', job.base).not()).filter(ee.Filter.lte('CLOUD_COVER', MAX_CLOUD))
    .filterBounds(targets.geometry()).map(function(raw) {
      var n = masks(raw).joint.and(gap).rename('g').unmask(0).clipToCollection(targets)
        .reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: targets.bounds(100), crs: CRS, crsTransform: GRID, maxPixels: 1e8, tileScale: 4}).get('g');
      return raw.set('gap_fill_pixels', n);
    }).filter(ee.Filter.gt('gap_fill_pixels', 0)).sort('gap_fill_pixels', false);
  var chosen = ee.List(ranked.toList(4));
  var selected = ee.ImageCollection.fromImages(ee.List.sequence(0, chosen.size().subtract(1)).map(function(i) {
    return ee.Image(chosen.get(ee.Number(i).int())).set('scene_index', ee.Number(i).add(1)); }));
  var processed = selected.map(function(img) { return prepare(img, Y); });
  var emptyImage = ee.Image.constant([0, 0, 0, 0, 0]).rename(['NDVI', 'LST', 'TVDI', 'scene_index', 'day_of_year']).toFloat().updateMask(ee.Image.constant(0));
  // canh it lap duoc nhat o duoi, canh lap nhieu nhat o tren cung
  var image = ee.Image(ee.Algorithms.If(processed.size().gt(0), processed.sort('gap_fill_pixels').mosaic(), emptyImage))
    .updateMask(gap).clipToCollection(targets).select(['NDVI', 'LST', 'TVDI', 'scene_index', 'day_of_year']).toFloat().setDefaultProjection(CRS, GRID);
  var prefix = 'MobileGIS_fill_' + Y;
  Export.image.toDrive({image: image.unmask({value: -9999, sameFootprint: false}), description: prefix + '_120m', fileNamePrefix: prefix + '_120m', folder: FOLDER,
    region: region, crs: CRS, crsTransform: GRID, maxPixels: 1e10, fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true, noData: -9999}});
  var fields = ['scene_index', 'LANDSAT_PRODUCT_ID', 'acquisition_date', 'day_of_year', 'CLOUD_COVER', 'WRS_PATH', 'WRS_ROW', 'gap_fill_pixels', 'year', 'resolution_m', 'tvdi_bins', 'tvdi_status', 'wet_slope', 'wet_intercept', 'dry_slope', 'dry_intercept'];
  Export.table.toDrive({collection: ee.FeatureCollection(processed.toList(4).map(function(it) { return ee.Feature(null, ee.Image(it).toDictionary(fields)); })),
    description: prefix + '_scenes', fileNamePrefix: prefix + '_scenes', folder: FOLDER, fileFormat: 'CSV', selectors: fields});
  print('Nam ' + Y + ': so khu vuc muc tieu', targets.size(), 'so canh ung vien', selected.size(), ranked.aggregate_array('LANDSAT_PRODUCT_ID'));
});
