/* Bo sung o thieu 2025, KHONG thay du lieu da co.
 * Chay trong GEE Code Editor bang tai khoan cua ban.
 * Da kiem tra cu phap cuc bo; chua chay tren tai khoan GEE.
 * Chi tao ung vien. scripts/review_gee_recovery.py kiem tra va ghep ban rieng.
 */
var UNIT_ASSET = 'projects/mobilegis-510608/assets/hcm167_GEE';
var YEAR = 2025;
var RECOVERY_BATCH = 1; // Chay 1 truoc. Chi chay 2 neu can them canh.
var FOLDER = 'MobileGIS_GEE_recovery_2025'; // TEN thu muc Drive cua ban, khong phai ID.
var SCALE = 120;
var CRS = 'EPSG:32648';
var GRID = [120, 0, 644880, 0, -120, 1272720];
var EXPORT_DIAGNOSTICS = true;
var SHOW_PREVIEW = false; // Mac dinh khong tinh raster trong phien tuong tac.
var TARGET_CODES = ['25942', '25945', '25951', '25969', '25975'];
var BASE_IDS = [
  'LC08_L2SP_124052_20250301_20250304_02_T1',
  'LC09_L2SP_124053_20250205_20250206_02_T1',
  'LC08_L2SP_125052_20250204_20250208_02_T1',
  'LC09_L2SP_125053_20250228_20250301_02_T1'
];
if (RECOVERY_BATCH !== 1 && RECOVERY_BATCH !== 2) {
  throw new Error('RECOVERY_BATCH phai bang 1 hoac 2.');
}
var units = ee.FeatureCollection(UNIT_ASSET).map(function(f) {
  return f.set('code', ee.Number.parse(ee.String(f.get('code'))).format('%05d'));
}).filter(ee.Filter.neq('code', '26732'));
var targets = units.filter(ee.Filter.inList('code', TARGET_CODES));
// Exact extent/grid of the supplied baseline TIFF, not a newly rounded region.
var region = ee.Geometry.Rectangle([644880, 1141080, 781800, 1272720], CRS, false);
var roi = units.bounds(100);
var candidates = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filterBounds(roi).filterDate('2025-01-01', '2025-05-01')
  .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'))
  .filter(ee.Filter.lte('CLOUD_COVER', 35));
var alternatives = candidates.filter(ee.Filter.inList('LANDSAT_PRODUCT_ID', BASE_IDS).not());
var targetRegion = targets.bounds(100);
// Cloud percentage for the WHOLE scene missed the local cloud patch in 2025.
// Rank by clear joint optical/thermal pixels inside the FIVE target wards.
var ranked = alternatives.map(function(raw) {
  var flags = masks(raw).joint.rename('good').unmask(0).clipToCollection(targets);
  var score = flags.reduceRegion({reducer:ee.Reducer.sum().unweighted(),geometry:targetRegion,
    crs:CRS,crsTransform:GRID,maxPixels:1e8,tileScale:4}).get('good');
  return raw.set('target_joint_pixels',ee.Number(ee.Algorithms.If(score,score,0)));
}).filter(ee.Filter.gt('target_joint_pixels',0));
var selected = ee.ImageCollection([]);
[[124,52], [124,53], [125,52], [125,53]].forEach(function(pair, position) {
  var choices = ranked.filter(ee.Filter.eq('WRS_PATH', pair[0]))
    .filter(ee.Filter.eq('WRS_ROW', pair[1])).sort('target_joint_pixels',false);
  // At most ONE scene per path/row in each batch, to bound TVDI fitting work.
  var one = ee.ImageCollection.fromImages(choices.toList(RECOVERY_BATCH)
    .slice(RECOVERY_BATCH - 1, RECOVERY_BATCH)).map(function(image) {
      return image.set('scene_index', position + 1);
    });
  selected = selected.merge(one);
});

function masks(image) {
  var qa = image.select('QA_PIXEL');
  var red = image.select('SR_B4').multiply(0.0000275).subtract(0.2);
  var nir = image.select('SR_B5').multiply(0.0000275).subtract(0.2);
  var lst = image.select('ST_B10').multiply(0.00341802).add(149).subtract(273.15).rename('LST');
  var clear = qa.bitwiseAnd(63).eq(0).and(image.select('QA_RADSAT').eq(0));
  var optical = clear.and(red.gte(0)).and(red.lte(1)).and(nir.gte(0))
    .and(nir.lte(1)).and(red.add(nir).gt(0));
  var joint = optical.and(lst.gte(-10)).and(lst.lte(70));
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  return {qa:qa, clear:clear, optical:optical, joint:joint,
    ndvi:ndvi, lst:lst, common:ndvi.addBands(lst).updateMask(joint)};
}
function prepare(image) {
  var m = masks(image), ndvi = m.ndvi, lst = m.lst;
  // Use the full study domain for fitting, not only the five small wards.
  var dryLand = m.common.updateMask(m.qa.bitwiseAnd(128).eq(0)).clipToCollection(units);
  var bins = ee.FeatureCollection(ee.List.sequence(0.1,0.8,0.05).map(function(start) {
    start = ee.Number(start);
    var inBin = dryLand.select('NDVI').gte(start).and(dryLand.select('NDVI').lt(start.add(0.05)));
    var stats = dryLand.select('LST').updateMask(inBin).reduceRegion({
      reducer:ee.Reducer.percentile([5,95]).combine({reducer2:ee.Reducer.count(),sharedInputs:true}),
      geometry:roi, crs:CRS, crsTransform:GRID, maxPixels:1e9, tileScale:4
    });
    return ee.Feature(null,{ndvi:start.add(0.025),wet:stats.get('LST_p5'),
      dry:stats.get('LST_p95'),count:stats.get('LST_count')});
  })).filter(ee.Filter.gte('count',80)).filter(ee.Filter.notNull(['wet','dry']));
  var enough = bins.size().gte(6), empty = ee.Dictionary({scale:0,offset:0});
  var wetFit = ee.Dictionary(ee.Algorithms.If(enough,bins.reduceColumns(ee.Reducer.linearFit(),['ndvi','wet']),empty));
  var dryFit = ee.Dictionary(ee.Algorithms.If(enough,bins.reduceColumns(ee.Reducer.linearFit(),['ndvi','dry']),empty));
  var wet = ndvi.multiply(ee.Number(wetFit.get('scale'))).add(ee.Number(wetFit.get('offset')));
  var dry = ndvi.multiply(ee.Number(dryFit.get('scale'))).add(ee.Number(dryFit.get('offset')));
  var lower = ee.Number(ee.Algorithms.If(enough,bins.aggregate_min('ndvi'),0)).subtract(0.025);
  var upper = ee.Number(ee.Algorithms.If(enough,bins.aggregate_max('ndvi'),0)).add(0.025);
  var tvdi = lst.subtract(wet).divide(dry.subtract(wet)).clamp(0,1).rename('TVDI')
    .updateMask(m.joint.and(m.qa.bitwiseAnd(128).eq(0)).and(dry.subtract(wet).gt(2))
      .and(ndvi.gte(lower)).and(ndvi.lt(upper))
      .and(ee.Image.constant(ee.Number(ee.Algorithms.If(enough,1,0)))));
  var triplet = m.common.addBands(tvdi);
  // A mosaic can otherwise select different dates for different masked bands.
  // Require all THREE bands from the same scene for each candidate pixel.
  var jointMask = triplet.mask().reduce(ee.Reducer.min());
  var day = image.date().getRelative('day', 'year').add(1);
  return triplet.addBands(ee.Image.constant(ee.Number(image.get('scene_index'))).rename('scene_index'))
    .addBands(ee.Image.constant(day).rename('day_of_year')).updateMask(jointMask).toFloat()
    .copyProperties(image, image.propertyNames()).set({year:YEAR,recovery_batch:RECOVERY_BATCH,
      resolution_m:SCALE,acquisition_date:image.date().format('YYYY-MM-dd'),day_of_year:day,
      tvdi_bins:bins.size(),wet_slope:wetFit.get('scale'),wet_intercept:wetFit.get('offset'),
      dry_slope:dryFit.get('scale'),dry_intercept:dryFit.get('offset'),
      tvdi_status:ee.Algorithms.If(enough,'experimental_fit','insufficient_bins')});
}
var processed = selected.map(prepare);
// Empty fallback makes the export readable even if no alternative is found.
// Local review rejects a file with zero filled pixels; it never becomes real data.
var emptyImage = ee.Image.constant([0,0,0,0,0])
  .rename(['NDVI','LST','TVDI','scene_index','day_of_year']).toFloat().updateMask(ee.Image.constant(0));
// Never put a fully masked constant (MaskOnly) in the Landsat collection.
// Casting AFTER mosaic is too late: collection compatibility is checked first.
var image = ee.Image(ee.Algorithms.If(processed.size().gt(0),
  processed.sort('CLOUD_COVER', false).mosaic(), emptyImage)).clipToCollection(targets)
  .select(['NDVI','LST','TVDI','scene_index','day_of_year']).toFloat()
  .setDefaultProjection(CRS, GRID);
var prefix = 'MobileGIS_recovery_2025_batch' + RECOVERY_BATCH;
Export.image.toDrive({image:image.unmask({value:-9999,sameFootprint:false}),
  description:prefix+'_120m',fileNamePrefix:prefix+'_120m',folder:FOLDER,
  region:region,crs:CRS,crsTransform:GRID,maxPixels:1e10,fileFormat:'GeoTIFF',
  formatOptions:{cloudOptimized:true,noData:-9999}});
var sceneFields = ['scene_index','LANDSAT_PRODUCT_ID','acquisition_date','day_of_year',
  'CLOUD_COVER','WRS_PATH','WRS_ROW','target_joint_pixels','year','recovery_batch','resolution_m',
  'tvdi_bins','tvdi_status','wet_slope','wet_intercept','dry_slope','dry_intercept'];
var scenes = ee.FeatureCollection(processed.toList(4).map(function(item) {
  return ee.Feature(null,ee.Image(item).toDictionary(sceneFields));
}));
Export.table.toDrive({collection:scenes,description:prefix+'_scenes',
  fileNamePrefix:prefix+'_scenes',folder:FOLDER,fileFormat:'CSV',selectors:sceneFields});

if (EXPORT_DIAGNOSTICS) {
  var diagnosticImages = candidates.filter(ee.Filter.inList('LANDSAT_PRODUCT_ID',BASE_IDS)).merge(selected);
  var diagnosticRows = ee.FeatureCollection(diagnosticImages.toList(8).map(function(item) {
    var raw = ee.Image(item), m = masks(raw);
    var footprint = raw.select('QA_PIXEL').mask().and(m.qa.bitwiseAnd(1).eq(0));
    // Keep missing ST separate from cloud/optical validity in the diagnostic.
    var thermal = raw.select('ST_B10').mask().and(raw.select('ST_B10').gt(0))
      .and(m.lst.gte(-10)).and(m.lst.lte(70));
    var flags = footprint.rename('footprint').unmask(0)
      .addBands(m.clear.rename('clear_qa').unmask(0))
      .addBands(m.optical.rename('optical_valid').unmask(0))
      .addBands(thermal.rename('thermal_available').unmask(0))
      .addBands(m.joint.rename('joint_valid').unmask(0));
    return flags.reduceRegions({collection:targets,reducer:ee.Reducer.sum().unweighted(),
      crs:CRS,crsTransform:GRID,tileScale:4}).map(function(f) {
        return f.set({LANDSAT_PRODUCT_ID:raw.get('LANDSAT_PRODUCT_ID'),
          acquisition_date:raw.date().format('YYYY-MM-dd'),CLOUD_COVER:raw.get('CLOUD_COVER'),
          role:ee.Algorithms.If(ee.List(BASE_IDS).contains(raw.get('LANDSAT_PRODUCT_ID')),'baseline','candidate'),
          year:YEAR,resolution_m:SCALE,recovery_batch:RECOVERY_BATCH}).setGeometry(null);
      });
  })).flatten();
  Export.table.toDrive({collection:diagnosticRows,description:prefix+'_diagnostics',
    fileNamePrefix:prefix+'_diagnostics',folder:FOLDER,fileFormat:'CSV',
    selectors:['code','fullname','LANDSAT_PRODUCT_ID','acquisition_date','role','CLOUD_COVER',
      'footprint','clear_qa','optical_valid','thermal_available','joint_valid','year','resolution_m','recovery_batch']});
}
Map.centerObject(targets,11);
Map.addLayer(targets.style({color:'c53a32',fillColor:'00000000',width:2}),{},'5 phuong can bo sung');
if (SHOW_PREVIEW) Map.addLayer(image.select('LST'),{min:20,max:45,
  palette:['0000FF','0066FF','00FFFF','00FF00','FFFF00','FFCC00','FF6600','FF0000']},'UNG VIEN LST 2025 batch '+RECOVERY_BATCH,false);
print('So don vi nghien cuu (167)',units.size());
print('So phuong muc tieu (5)',targets.size());
print('So canh ung vien (toi da 4)',selected.size());
print('Chi tao ung vien cung mua nam 2025. Khong cam ket du 5 phuong.');
print('Tasks: chay '+prefix+'_120m, _scenes va _diagnostics. Gui ca 3 file de kiem tra.');
