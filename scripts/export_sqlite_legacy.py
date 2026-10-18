"""One-time read-only preservation of former SQLite practice records. Not runtime."""
import hashlib,json,sqlite3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'mobilegis.sqlite3'
with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as c:
    c.row_factory=sqlite3.Row
    rows=[dict(r) for r in c.execute('SELECT id,name,lat,lon,year,lst,ndvi,tvdi,source FROM observations ORDER BY id')]
out=ROOT/'database/seeds/demo_legacy.json';out.parent.mkdir(parents=True,exist_ok=True)
if out.exists():raise SystemExit('Seed already exists; not overwriting the migration snapshot.')
out.write_text(json.dumps({'origin':'former SQLite read-only migration snapshot','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rows':rows},ensure_ascii=False,indent=2),encoding='utf8')
print(f'Preserved {len(rows)} practice records; original SQLite untouched.')
