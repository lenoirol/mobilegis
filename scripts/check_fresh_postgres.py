"""Validate a clean PG2 import in an isolated, disposable database we create.

The administrator DSN must be supplied only through the environment. This does
not change the configured mobilegis database or its application credentials.
"""
import os, sys, uuid
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import database as db
import psycopg
from psycopg import sql
from import_postgres import import_all

def check():
    owner = os.environ.get('MOBILEGIS_OWNER_DATABASE_URL')
    if not owner:
        raise RuntimeError('Supply MOBILEGIS_OWNER_DATABASE_URL in the environment.')
    name = 'mobilegis_pg2_installcheck_' + uuid.uuid4().hex
    created = False
    with psycopg.connect(owner, autocommit=True) as admin:
        try:
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
            created = True
            params = psycopg.conninfo.conninfo_to_dict(owner)
            params['dbname'] = name
            with psycopg.connect(**params, row_factory=psycopg.rows.dict_row) as conn:
                counts = import_all(conn)
                assert all(r['rows'] == 1002 for r in counts) and len(counts) == 3
                for k in ('lst', 'ndvi', 'tvdi'):
                    assert conn.execute(sql.SQL('SELECT count(*) AS n FROM mobilegis.{}').format(sql.Identifier(k + '_observations'))).fetchone()['n'] == 3006
                assert conn.execute('SELECT max(version) AS v FROM mobilegis.schema_migrations').fetchone()['v'] == 2
                assert conn.execute('SELECT count(*) AS n FROM mobilegis.admin_units WHERE geom_original IS NOT NULL AND ST_IsValid(geom_original)').fetchone()['n'] == 167
                assert conn.execute('SELECT count(*) AS n FROM mobilegis.demo_observations').fetchone()['n'] == 36
            print('PASS: fresh PG2 import, three metric tables, original boundaries and demo seed.')
        finally:
            if created:
                # Only the randomly named database created above can be removed.
                assert name.startswith('mobilegis_pg2_installcheck_') and name != 'mobilegis'
                admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
                print('Disposable installation-check database removed; mobilegis unchanged.')

if __name__ == '__main__':
    try:
        check()
    except Exception as exc:
        print('Fresh installation check failed: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(1)
