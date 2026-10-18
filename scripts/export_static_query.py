"""Export the 120 m query grids as small gzip blocks so the static demo (GitHub Pages) can look up a pixel without the server.

Reads the same float32 grids /api/sample uses (data/query_grid/*.bin, listed in public/data/<source>/products.json → query)
and writes public/data/query/<source>/<name>/<bx>_<by>.bin.gz plus public/data/query/<source>/index.json.

Each block holds BLOCK×BLOCK little-endian int16 values: value × scale, NoData = -32768. Lookup in the browser uses the
same nearest-cell arithmetic as server.py, so a value differs from the server only by the quantisation step
(LST 0.01 °C; NDVI and TVDI 0.0001), finer than what the app displays.

Usage: python scripts/export_static_query.py [--source gee_recovery]
"""
import argparse, gzip, json, math, shutil
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCK = 256
NODATA = -32768
SCALE = {'lst': 100, 'ndvi': 10000, 'tvdi': 10000}


def export(source):
    products = json.loads((ROOT / f'public/data/{source}/products.json').read_text(encoding='utf8'))
    out_root = ROOT / 'public/data/query' / source
    if out_root.exists():
        shutil.rmtree(out_root)
    index = {'block': BLOCK, 'nodata': NODATA, 'format': 'int16-le gzip', 'grids': {}}
    total = 0
    for name, meta in sorted(products['query'].items()):
        key = name.replace('change_', '').split('_')[0]
        scale = SCALE[key]
        w, h = meta['width'], meta['height']
        raw = array('f')
        with open(ROOT / 'data/query_grid' / meta['path'], 'rb') as f:
            raw.fromfile(f, w * h)
        out = out_root / name
        out.mkdir(parents=True)
        blocks = 0
        for by in range(math.ceil(h / BLOCK)):
            for bx in range(math.ceil(w / BLOCK)):
                cells = array('h', [NODATA]) * (BLOCK * BLOCK)
                valid = 0
                for y in range(BLOCK):
                    gy = by * BLOCK + y
                    if gy >= h:
                        break
                    row = gy * w
                    for x in range(BLOCK):
                        gx = bx * BLOCK + x
                        if gx >= w:
                            break
                        v = raw[row + gx]
                        if math.isfinite(v):
                            q = round(v * scale)
                            if -32767 <= q <= 32767:
                                cells[y * BLOCK + x] = q
                                valid += 1
                if not valid:
                    continue          # empty block: the browser treats a missing file as NoData
                data = gzip.compress(cells.tobytes(), compresslevel=9, mtime=0)
                (out / f'{bx}_{by}.bin.gz').write_bytes(data)
                total += len(data); blocks += 1
        index['grids'][name] = {'width': w, 'height': h, 'bounds': meta['bounds'], 'scale': scale, 'blocks': blocks}
        print(f'{name}: {blocks} khối')
    (out_root / 'index.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf8')
    print(f'Tổng {total / 1e6:.1f} MB → {out_root.relative_to(ROOT)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--source', default='gee_recovery')
    export(parser.parse_args().source)
