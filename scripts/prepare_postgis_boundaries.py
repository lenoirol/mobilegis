"""Create an immutable full-resolution vector seed from preserved source files.
No downloads, simplification or changes to originals. No GIS library needed.
"""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def prepare():
    display=json.loads((ROOT/'public/data/hcm_167.geojson').read_text(encoding='utf8'))
    originals={}
    for p in (ROOT/'data/sources/boundaries').glob('*.geojson'):
        f=json.loads(p.read_text(encoding='utf8'))['features'][0]
        originals[str(f['properties']['code'])]=(f['geometry'],hashlib.sha256(p.read_bytes()).hexdigest())
    features=[]
    for f in display['features']:
        geometry,sha=originals[str(f['id'])]
        features.append({'type':'Feature','id':str(f['id']),'properties':{**f['properties'],'original_sha256':sha},'geometry':geometry})
    assert len(features)==167 and len({f['id'] for f in features})==167
    payload={'type':'FeatureCollection','method':'Preserved full-resolution source geometries; not simplified display polygons','features':features}
    target=ROOT/'database/seeds/boundaries_original.geojson'
    content=json.dumps(payload,ensure_ascii=False,separators=(',',':'))
    if target.exists():
        if target.read_text(encoding='utf8')!=content:raise RuntimeError('Published vector seed changed; no overwrite.')
    else:target.write_text(content,encoding='utf8')
    print('Prepared 167 original polygons:',target)
if __name__=='__main__':prepare()
