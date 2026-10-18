"""Build a GEE-uploadable Shapefile ZIP from the original public geometries."""
import sys, json, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'.geo-libs'))
import shapefile
from shapely.geometry import shape, mapping
from shapely.geometry.polygon import orient
from shapely import make_valid

dest=ROOT/'data/gee_boundary';dest.mkdir(exist_ok=True)
display=json.loads((ROOT/'public/data/hcm_167.geojson').read_text(encoding='utf8'))
names={f['id']:f['properties']['full_name'] for f in display['features']}
with shapefile.Writer(str(dest/'hcm167'),shapeType=shapefile.POLYGON,encoding='utf-8') as writer:
    writer.field('code','C',5);writer.field('fullname','C',150)
    for path in sorted((ROOT/'data/sources/boundaries').glob('*.geojson')):
        feature=json.loads(path.read_text(encoding='utf8'))['features'][0]
        code=feature['properties']['code']
        if code not in names:continue
        geometry=make_valid(shape(feature['geometry']))
        polygons=[geometry] if geometry.geom_type=='Polygon' else list(geometry.geoms)
        rings=[]
        for poly in polygons:
            poly=orient(poly,sign=-1) # Shapefile: clockwise exterior, counterclockwise holes.
            rings.append(list(poly.exterior.coords))
            rings.extend(list(r.coords) for r in poly.interiors)
        writer.poly(rings);writer.record(code,names[code])
(dest/'hcm167.prj').write_text('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',encoding='ascii')
(dest/'hcm167.cpg').write_text('UTF-8',encoding='ascii')
with zipfile.ZipFile(dest/'hcm167_GEE.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for ext in ('shp','shx','dbf','prj','cpg'):bundle.write(dest/f'hcm167.{ext}',f'hcm167.{ext}')
assert len(shapefile.Reader(str(dest/'hcm167'),encoding='utf8'))==167
print(dest/'hcm167_GEE.zip')
