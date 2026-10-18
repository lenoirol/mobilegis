"""Read-only asset verification; optional re-import test rolls its transaction back."""
import argparse,getpass,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import database as db

def main(check_import=False):
    with db.connect() as c:
        assets=c.execute('SELECT relative_path,sha256,size_bytes FROM mobilegis.asset_catalog').fetchall()
        tables=c.execute("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='mobilegis' AND table_type='BASE TABLE'").fetchone()['n']
    for a in assets:
        path=ROOT/a['relative_path']
        with path.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
        if path.stat().st_size!=a['size_bytes'] or sha!=a['sha256']:
            raise ValueError('Original asset differs: '+a['relative_path'])
    print('Original asset SHA256 verified:',len(assets),'files. Schema tables:',tables,flush=True)
    if check_import:
        from import_postgres import import_all
        cfg={**db.config(),'user':'postgres','password':getpass.getpass('PostgreSQL admin password: ')}
        with db.psycopg.connect(**cfg,row_factory=db.dict_row) as c:
            try:
                import_all(c)
                n=c.execute('SELECT count(*) AS n FROM mobilegis.pixel_statistics').fetchone()['n']
                if n!=9018:raise ValueError('Incomplete statistics import.')
                print('Portable re-import verified; transaction rolled back; no persistent changes.',flush=True)
            finally:c.rollback()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--import-check',action='store_true');a=p.parse_args();main(a.import_check)
