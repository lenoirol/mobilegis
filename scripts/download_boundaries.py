"""Download a pinned community boundary dataset and verify the 2025 unit list."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / '.geo-libs'))
COMMIT = 'cd58063299585146ded3981f2272946ef19ced54'
REPO = 'thanglequoc/vietnamese-provinces-database'
RAW = f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/'

def fetch(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MobileGIS-research/1.0'}), timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)

def main():
    from shapely.geometry import shape, mapping
    from shapely import make_valid
    out = ROOT / 'public' / 'data'
    raw = ROOT / 'data' / 'sources' / 'boundaries'
    out.mkdir(parents=True, exist_ok=True)
    raw.mkdir(parents=True, exist_ok=True)
    listing = json.loads(fetch(f'https://api.github.com/repos/{REPO}/contents/json/geojson/79_ho_chi_minh/wards?ref={COMMIT}'))
    listing = [r for r in listing if r['name'].endswith('.geojson')]
    assert len(listing) == 168, 'Unexpected number of source units'
    def download(row):
        target = raw / row['name']
        if not target.exists():
            target.write_bytes(fetch(RAW + row['path']))
        return json.loads(target.read_text(encoding='utf-8'))['features'][0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        original = list(pool.map(download, listing))
    features = []
    repairs = []
    for f in original:
        p = f['properties']
        if p['code'] == '26732':  # Con Dao only; retain nearshore islands.
            continue
        geom = shape(f['geometry'])
        if not geom.is_valid:
            repairs.append(p['code'])
            geom = make_valid(geom)
        assert geom.geom_type in ('Polygon', 'MultiPolygon')
        point = geom.representative_point()
        # Full precision originals remain under data/sources; simplify display only.
        props = {'code': p['code'], 'name': p['name'], 'full_name': p['fullName'],
                 'province_code': '79', 'area_km2_source': p.get('areaKm2'),
                 'lat': point.y, 'lon': point.x, 'boundary_version': '2025-reference'}
        features.append({'type': 'Feature', 'id': p['code'], 'properties': props,
                         'geometry': mapping(geom.simplify(0.00004, preserve_topology=True))})
    features.sort(key=lambda f: f['id'])
    assert len(features) == 167 and len({f['id'] for f in features}) == 167
    assert any(f['id'] == '27676' for f in features), 'Nearshore Thanh An must remain'
    payload = {'type': 'FeatureCollection', 'features': features}
    dest = out / 'hcm_167.geojson'
    dest.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (raw / 'LICENSE.txt').write_bytes(fetch(RAW + 'LICENSE'))
    # Snapshot of the non-GIS administrative list at the 2025 release.
    reference_url = f'https://raw.githubusercontent.com/{REPO}/v3.0.2/json/simplified_json_generated_data_vn_units.json'
    verification = {'status': 'not_checked'}
    try:
        reference = fetch(reference_url)
        (raw / 'administrative_list_2025.json').write_bytes(reference)
        units = json.loads(reference)
        province = next(p for p in units if str(p['Code']) == '79')
        codes = {str(w['Code']) for w in province['Wards']}
        actual = {f['properties']['code'] for f in original}
        verification = {'status': 'matched' if codes == actual else 'mismatch',
                        'reference_count': len(codes), 'missing': sorted(codes-actual), 'extra': sorted(actual-codes)}
    except Exception as e:
        verification = {'status': 'needs_review', 'reason': str(e)}
    metadata = {'source': f'https://github.com/{REPO}', 'commit': COMMIT,
                'upstream_reference_map': 'https://sapnhap.bando.com.vn',
                'license': 'MIT (repository); reference boundaries, not cadastral certification',
                'downloaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'source_count': 168, 'included_count': 167, 'excluded_code': '26732',
                'simplification_degrees': 0.00004, 'repaired_geometry_codes': repairs,
                'administrative_list_2025_url': reference_url, 'list_verification': verification,
                'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()}
    (out / 'boundary_source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False, indent=2), flush=True)

if __name__ == '__main__':
    main()
