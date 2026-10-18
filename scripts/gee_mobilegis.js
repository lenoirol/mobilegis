/* MobileGIS GEE export — 2025 exports supplied by the user and checked locally.
 * Revised 2020–2024 script: syntax checked; not yet executed in the user's GEE.
 * Upload data/gee_boundary/hcm167_GEE.zip, then replace UNIT_ASSET below.
 * Same Jan–Apr, QA and scene-priority concept as local data, but native GEE
 * grids / percentile implementation differ. Never mix new and old statistics.
 */
var UNIT_ASSET = 'projects/mobilegis-510608/assets/hcm167_GEE';
var YEARS = [2020]; // Run 2020, then 2021, 2022, 2023, 2024 separately.
var SCALE = 120; // Deliberate preview scale; choose 30 only for a NEW full-grid run.
var CRS = 'EPSG:32648';
var FOLDER = 'MobileGIS_GEE_phuhuy_20261004';
var EXPORT_WORLDCOVER = false; // 2021 WorldCover already completed; do not duplicate.
var units = ee.FeatureCollection(UNIT_ASSET).map(function(f) {
  return f.set('code', ee.Number.parse(ee.String(f.get('code'))).format('%05d'));
}).filter(ee.Filter.neq('code','26732'));
var roi = units.bounds(100); // Avoid union of all complex polygons.
var pairs = [[124,52],[124,53],[125,52],[125,53]];
var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2');

function prepare(image) {
  var qa=image.select('QA_PIXEL');
  var red=image.select('SR_B4').multiply(0.0000275).subtract(0.2);
  var nir=image.select('SR_B5').multiply(0.0000275).subtract(0.2);
  var lst=image.select('ST_B10').multiply(0.00341802).add(149).subtract(273.15).rename('LST');
  var mask=qa.bitwiseAnd(63).eq(0).and(image.select('QA_RADSAT').eq(0))
    .and(red.gte(0)).and(red.lte(1)).and(nir.gte(0)).and(nir.lte(1))
    .and(red.add(nir).gt(0)).and(lst.gte(-10)).and(lst.lte(70));
  // Expression permits negative reflectance screening to be controlled explicitly.
  var ndvi=nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  var common=ndvi.addBands(lst).updateMask(mask);
  var dryLand=common.updateMask(qa.bitwiseAnd(128).eq(0)).clipToCollection(units);
  var bins=ee.FeatureCollection(ee.List.sequence(0.1,0.8,0.05).map(function(start) {
    start=ee.Number(start);
    var inBin=dryLand.select('NDVI').gte(start).and(dryLand.select('NDVI').lt(start.add(0.05)));
    var stats=dryLand.select('LST').updateMask(inBin).reduceRegion({
      reducer:ee.Reducer.percentile([5,95]).combine({reducer2:ee.Reducer.count(),sharedInputs:true}),
      geometry:roi,scale:SCALE,crs:CRS,maxPixels:1e9,tileScale:4
    });
    return ee.Feature(null,{ndvi:start.add(0.025),wet:stats.get('LST_p5'),dry:stats.get('LST_p95'),count:stats.get('LST_count')});
  })).filter(ee.Filter.gte('count',80)).filter(ee.Filter.notNull(['wet','dry']));
  var enough=bins.size().gte(6);
  var empty=ee.Dictionary({scale:0,offset:0});
  var wetFit=ee.Dictionary(ee.Algorithms.If(enough,bins.reduceColumns(ee.Reducer.linearFit(),['ndvi','wet']),empty));
  var dryFit=ee.Dictionary(ee.Algorithms.If(enough,bins.reduceColumns(ee.Reducer.linearFit(),['ndvi','dry']),empty));
  var wet=ndvi.multiply(ee.Number(wetFit.get('scale'))).add(ee.Number(wetFit.get('offset')));
  var dry=ndvi.multiply(ee.Number(dryFit.get('scale'))).add(ee.Number(dryFit.get('offset')));
  var lower=ee.Number(ee.Algorithms.If(enough,bins.aggregate_min('ndvi'),0)).subtract(0.025);
  var upper=ee.Number(ee.Algorithms.If(enough,bins.aggregate_max('ndvi'),0)).add(0.025);
  var tvdi=lst.subtract(wet).divide(dry.subtract(wet)).clamp(0,1).rename('TVDI')
    .updateMask(mask.and(qa.bitwiseAnd(128).eq(0)).and(dry.subtract(wet).gt(2))
      .and(ndvi.gte(lower)).and(ndvi.lt(upper)).and(ee.Image.constant(ee.Number(ee.Algorithms.If(enough,1,0)))));
  return common.addBands(tvdi).copyProperties(image,image.propertyNames()).set({
    tvdi_bins:bins.size(),wet_slope:wetFit.get('scale'),wet_intercept:wetFit.get('offset'),
    dry_slope:dryFit.get('scale'),dry_intercept:dryFit.get('offset'),
    tvdi_status:ee.Algorithms.If(enough,'experimental_fit','insufficient_bins'),
    acquisition_date:image.date().format('YYYY-MM-dd')
  });
}

Map.centerObject(roi,9);
print('Unit count (must be 167)',units.size());
print('Experimental TVDI: review fits and cloud coverage before interpretation.');
YEARS.forEach(function(year) {
  var candidates=l8.merge(l9).filterBounds(roi)
    .filterDate(year+'-01-01',(year)+'-05-01')
    .filter(ee.Filter.eq('PROCESSING_LEVEL','L2SP'))
    .filter(ee.Filter.lte('CLOUD_COVER',35));
  var selected=ee.ImageCollection([]);
  pairs.forEach(function(pair) {
    selected=selected.merge(candidates.filter(ee.Filter.eq('WRS_PATH',pair[0]))
      .filter(ee.Filter.eq('WRS_ROW',pair[1])).sort('CLOUD_COVER').limit(1));
  });
  print('Selected scenes '+year,selected.aggregate_array('LANDSAT_PRODUCT_ID'));
  var processed=selected.map(prepare);
  // mosaic prioritizes LAST valid pixel, so descending cloud order prefers low cloud.
  var image=processed.sort('CLOUD_COVER',false).mosaic().clipToCollection(units).toFloat()
    .setDefaultProjection(CRS,[SCALE,0,0,0,-SCALE,0]);
  Map.addLayer(image.select('LST'),{min:20,max:45,palette:['0000FF','0066FF','00FFFF','00FF00','FFFF00','FFCC00','FF6600','FF0000']},'LST '+year,true);
  Map.addLayer(image.select('NDVI'),{min:-.2,max:1,palette:['FF0000','FF7F00','FFFF00','ADFF2F','00FF00','00FFFF','007FFF','0000FF']},'NDVI '+year,false);
  Map.addLayer(image.select('TVDI'),{min:0,max:1,palette:['066b00','0bc400','0ce100','00ff00','ffff00','ffcc00','ff6600','ff0000']},'TVDI '+year+' experimental',false);
  Export.image.toDrive({image:image.unmask({value:-9999,sameFootprint:false}),description:'MobileGIS_indices_'+year+'_'+SCALE+'m',folder:FOLDER,
    region:roi,crsTransform:[SCALE,0,0,0,-SCALE,0],crs:CRS,maxPixels:1e10,fileFormat:'GeoTIFF',
    formatOptions:{cloudOptimized:true,noData:-9999}});
  // Use the SAME pixel-centre rule for means, valid counts and total counts.
  // Original 2025 CSV mixed edge rules and showed coverage above 100%.
  var reducer=ee.Reducer.mean().unweighted().combine({reducer2:ee.Reducer.count(),sharedInputs:true});
  var table=image.reduceRegions({collection:units,reducer:reducer,scale:SCALE,crs:CRS,tileScale:4})
    .map(function(f) {
      var total=ee.Number(image.select('NDVI').multiply(0).unmask({value:0,sameFootprint:false})
        .add(1).rename('all').reduceRegion({reducer:ee.Reducer.count(),geometry:f.geometry(),
          scale:SCALE,crs:CRS,maxPixels:1e9,tileScale:4}).get('all'));
      var result=f.set({year:year,resolution_m:SCALE,method:'first_valid_low_cloud_scene',
        scene_ids:selected.aggregate_array('LANDSAT_PRODUCT_ID'),sampled_pixels:total});
      ['LST','NDVI','TVDI'].forEach(function(k) {
        var count=ee.Number(f.get(k+'_count')),coverage=count.divide(total.max(1));
        result=result.set(k+'_coverage',coverage).set(k+'_mean',ee.Algorithms.If(count.gte(5).and(coverage.gte(0.1)),f.get(k+'_mean'),null));
      });
      return result.set('statistics_rule','unweighted_pixel_centres').setGeometry(null);
    });
  Export.table.toDrive({collection:table,description:'MobileGIS_units_'+year+'_'+SCALE+'m',folder:FOLDER,fileFormat:'CSV'});
  var scenes=ee.FeatureCollection(processed.toList(processed.size()).map(function(item) {
    item=ee.Image(item);
    return ee.Feature(null,item.toDictionary(['LANDSAT_PRODUCT_ID','acquisition_date','CLOUD_COVER',
      'tvdi_bins','wet_slope','wet_intercept','dry_slope','dry_intercept','tvdi_status'])).set({year:year,resolution_m:SCALE});
  }));
  Export.table.toDrive({collection:scenes,description:'MobileGIS_scenes_'+year,folder:FOLDER,fileFormat:'CSV'});
});
var worldcover=ee.ImageCollection('ESA/WorldCover/v200').first().select('Map').clipToCollection(units);
Map.addLayer(worldcover,{},'WorldCover 2021',false);
Map.addLayer(units.style({color:'344c45',fillColor:'00000000',width:1}),{},'167 units');
if(EXPORT_WORLDCOVER) Export.image.toDrive({image:worldcover.unmask({value:0,sameFootprint:false}),description:'MobileGIS_WorldCover_2021_10m',folder:FOLDER,
  region:roi,scale:10,crs:CRS,maxPixels:1e10,fileFormat:'GeoTIFF',formatOptions:{cloudOptimized:true,noData:0}});
