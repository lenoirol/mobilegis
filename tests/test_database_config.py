"""Remote-database support: DSN files, TLS defaults and the connection pool (exercised against the local server)."""
import json, os, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import database as db
from psycopg.conninfo import conninfo_to_dict, make_conninfo


class DatabaseConfigTests(unittest.TestCase):
    def setUp(self):
        # These tests choose their own config file; remember an externally supplied one (e.g. a remote rehearsal run).
        self.outer = os.environ.pop('MOBILEGIS_DB_CONFIG', None)

    def tearDown(self):
        os.environ.pop('MOBILEGIS_DB_CONFIG', None)
        if self.outer is not None:
            os.environ['MOBILEGIS_DB_CONFIG'] = self.outer
        for pool in db._POOLS.values():
            pool.close()
        db._POOLS.clear()

    def test_tls_is_required_for_remote_hosts_only(self):
        remote = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
        self.assertEqual(conninfo_to_dict(db.with_ssl(remote))['sslmode'], 'require')
        for local in ('postgresql://u:p@127.0.0.1:5433/mobilegis', 'postgresql://u:p@localhost/mobilegis'):
            self.assertNotIn('sslmode', conninfo_to_dict(db.with_ssl(local)))
        explicit = remote + '?sslmode=verify-full'
        self.assertEqual(conninfo_to_dict(db.with_ssl(explicit))['sslmode'], 'verify-full')

    def test_dsn_file_enables_the_pool_and_still_serves_real_queries(self):
        local = db._load()[0]
        self.assertIsInstance(local, dict)   # default path unchanged: keyword dict, no pool
        dsn = make_conninfo(**{k: v for k, v in local.items() if k in ('host', 'port', 'dbname', 'user', 'password')})
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'remote.json'
            path.write_text(json.dumps({'dsn': dsn, 'pool_size': 2}), encoding='utf8')
            os.environ['MOBILEGIS_DB_CONFIG'] = str(path)
            target, extra = db._load()
            self.assertIsInstance(target, str)
            self.assertTrue(extra['pool'])
            self.assertEqual(db.health()['schema_version'], 4)
            rows = db.observations('gee_recovery', 2025, '25750')
            self.assertEqual(len(rows), 1)
            with db.connect() as c:   # session setting applied after connect (poolers reject startup options)
                self.assertEqual(c.execute('SHOW statement_timeout').fetchone()['statement_timeout'], '15s')
            for _ in range(5):        # connections are reused, not leaked
                db.demo()
            self.assertIn(target, db._POOLS)   # one pool per DSN, created once and reused

    def test_pool_can_be_switched_off_and_missing_file_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'x.json'
            path.write_text(json.dumps({'dsn': 'postgresql://u:p@127.0.0.1/db', 'pool': False}), encoding='utf8')
            os.environ['MOBILEGIS_DB_CONFIG'] = str(path)
            self.assertFalse(db._load()[1]['pool'])
            os.environ['MOBILEGIS_DB_CONFIG'] = str(Path(temp) / 'missing.json')
            with self.assertRaises(RuntimeError):
                db._load()


if __name__ == '__main__':
    unittest.main()
