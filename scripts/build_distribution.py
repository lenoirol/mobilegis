"""PG2 code + research package. Requires external PostgreSQL/PostGIS.
No credentials, database cluster, SQLite, or source-band caches; no overwrite.
"""
from pathlib import Path
import argparse,zipfile,json,hashlib
ROOT=Path(__file__).resolve().parents[1]

def build(output):
    if output.exists():raise FileExistsError('Archive exists; choose a new name. No overwrite.')
    files=[p for p in ROOT.iterdir() if p.is_file() and (p.suffix in ('.py','.cmd','.md','.txt') or p.name=='.gitignore')]
    for folder in ('database','scripts','tests','public','data/rasters','data/context','data/query_grid','data/gee','data/gee_recovery','data/gee_boundary','verification'):
        files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file())
    files.append(ROOT/'data/sources/boundaries/LICENSE.txt')
    files=sorted(set(p for p in files if '__pycache__' not in p.parts and not p.name.endswith('.local.json') and 'backups' not in p.parts))
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for p in files:archive.write(p,'mobilegis/'+p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        names=archive.namelist()
        assert 'mobilegis/database/schema.sql' in names and 'mobilegis/database/seeds/demo_legacy.json' in names
        assert not any('.local.json' in n or n.endswith('.sqlite3') or '/config/' in n or '/.legacy/' in n for n in names)
    h=hashlib.sha256()
    with output.open('rb') as f:
        while block:=f.read(1024*1024):h.update(block)
    return {'path':str(output),'files':len(files),'size_mb':round(output.stat().st_size/1024**2,2),'sha256':h.hexdigest(),'database':'External PostgreSQL/PostGIS required; see DATABASE_POSTGRESQL.md','credentials_included':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT.parent/'MobileGIS_POSTGRESQL_PG2.zip');args=parser.parse_args()
    print(json.dumps(build(args.output.resolve()),ensure_ascii=False,indent=2))
