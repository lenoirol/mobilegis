/* Chuoi THANG 2020-01 .. 2026-10 cua LST va NDVI theo 167 xa/phuong, tu MODIS Terra (MOD11A2 + MOD13A1, ban 061).
 * Muc dich: lam dau vao cho DU BAO THEO THANG (scripts/forecast_monthly.py). Landsat chi co 1 canh/mua kho nen khong du chuoi thang.
 * Ghi chu trung thuc: MODIS o 1 km (LST) va 500 m (NDVI), tho hon Landsat 120 m; thang thieu du lieu de TRONG, khong noi suy.
 * Terra qua khoang 10:30 gan gio qua cua Landsat (~10:00), nen hai nguon tuong thich ve gio chup nhung KHONG tron so lieu.
 * TVDI chua dua vao chuoi thang (can tinh lai canh kho/uot theo thang); du bao hien chi LST va NDVI.
 * Chay trong GEE Code Editor bang tai khoan cua ban -> Tasks -> Run -> tai CSV tu Drive ve data/forecast_input/modis_monthly.csv
 */
var UNIT_ASSET = 'projects/mobilegis-510608/assets/hcm167_GEE';
var FOLDER = 'MobileGIS_GEE_monthly'; // TEN thu muc Drive cua ban, khong phai ID.
var START = '2020-01-01', END_EXCLUSIVE = '2026-11-01'; // thang day du cuoi cung: 2026-10
var MIN_QUALITY_OK = 1; // QC: 0 = tot, 1 = chap nhan (khac) -> loai 2,3 (may / khong tao duoc)

var units = ee.FeatureCollection(UNIT_ASSET).map(function(f) {
  return ee.Feature(f.geometry(), {code: ee.Number.parse(ee.String(f.get('code'))).format('%05d')});
});

var lstCol = ee.ImageCollection('MODIS/061/MOD11A2');
var ndviCol = ee.ImageCollection('MODIS/061/MOD13A1');

function lstImage(img) {
  var ok = img.select('QC_Day').bitwiseAnd(3).lte(MIN_QUALITY_OK);
  return img.select('LST_Day_1km').updateMask(ok).multiply(0.02).subtract(273.15).rename('lst');
}
function ndviImage(img) {
  var ok = img.select('SummaryQA').lte(MIN_QUALITY_OK);
  return img.select('NDVI').updateMask(ok).multiply(0.0001).rename('ndvi');
}

var n = ee.Date(END_EXCLUSIVE).difference(ee.Date(START), 'month').round();
var months = ee.List.sequence(0, n.subtract(1)).map(function(i) { return ee.Date(START).advance(i, 'month'); });

var perMonth = months.map(function(d) {
  d = ee.Date(d);
  var from = d, to = d.advance(1, 'month');
  var lst = lstCol.filterDate(from, to).map(lstImage).mean();
  var ndvi = ndviCol.filterDate(from, to).map(ndviImage).mean();
  var lstNum = lstCol.filterDate(from, to).size(), ndviNum = ndviCol.filterDate(from, to).size();
  var stack = lst.addBands(ndvi);
  var stats = stack.reduceRegions({
    collection: units,
    reducer: ee.Reducer.mean().combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
    scale: 500, crs: 'EPSG:4326', tileScale: 4
  });
  // tong so o goc 500 m trong tung xa/phuong de tinh do phu
  return stats.map(function(f) {
    return ee.Feature(null, {
      code: f.get('code'), month: d.format('YYYY-MM'),
      lst: f.get('lst_mean'), lst_pixels: f.get('lst_count'),
      ndvi: f.get('ndvi_mean'), ndvi_pixels: f.get('ndvi_count'),
      scenes_lst: lstNum, scenes_ndvi: ndviNum
    });
  });
});
var table = ee.FeatureCollection(perMonth).flatten();

// So o toan phan (de tinh do phu = pixels / sampled_pixels), cung luoi 500 m.
var total = ee.Image.constant(1).rename('t').reduceRegions({collection: units, reducer: ee.Reducer.count(), scale: 500, crs: 'EPSG:4326'})
  .map(function(f) { return ee.Feature(null, {code: f.get('code'), sampled_pixels: f.get('count')}); });

print('So dong du kien (167 x so thang):', table.size());
Export.table.toDrive({collection: table, description: 'modis_monthly_lst_ndvi', folder: FOLDER, fileNamePrefix: 'modis_monthly',
  fileFormat: 'CSV', selectors: ['code', 'month', 'lst', 'lst_pixels', 'ndvi', 'ndvi_pixels', 'scenes_lst', 'scenes_ndvi']});
Export.table.toDrive({collection: total, description: 'modis_monthly_sampled', folder: FOLDER, fileNamePrefix: 'modis_sampled_pixels',
  fileFormat: 'CSV', selectors: ['code', 'sampled_pixels']});
