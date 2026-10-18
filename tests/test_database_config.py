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
            self.assertEqual(db.health()['schema_version'], 6)
            rows = db.observations('gee_recovery', 2025, '25750')
            self.assertEqual(len(rows), 1)
            with db.connect() as c:   # session setting applied after connect (poolers reject startup options)
                self.assertEqual(c.execute('SHOW statement_timeout').fetchone()['statement_timeout'], '15s')
                self.assertEqual(c.execute('SHOW extra_float_digits').fetchone()['extra_float_digits'], '3')   # exact floats (Supabase defaults to 0)
            for _ in range(5):        # connections are reused, not leaked
                db.demo()
            self.assertIn(target, db._POOLS)   # one pool per DSN, created once and reused

    def test_environment_variable_dsn_uses_tls_for_remote_hosts_and_the_pool(self):
        old = os.environ.get('MOBILEGIS_DATABASE_URL')
        os.environ['MOBILEGIS_DATABASE_URL'] = 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
        try:
            target, extra = db._load()
            self.assertEqual(conninfo_to_dict(target)['sslmode'], 'require')
            self.assertTrue(extra['pool'])
            self.assertEqual(extra['pool_size'], 4)
        finally:
            os.environ.pop('MOBILEGIS_DATABASE_URL', None)
            if old is not None:
                os.environ['MOBILEGIS_DATABASE_URL'] = old

    def test_pool_can_be_switched_off_and_missing_file_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'x.json'
            path.write_text(json.dumps({'dsn': 'postgresql://u:p@127.0.0.1/db', 'pool': False}), encoding='utf8')
            os.environ['MOBILEGIS_DB_CONFIG'] = str(path)
            self.assertFalse(db._load()[1]['pool'])
            os.environ['MOBILEGIS_DB_CONFIG'] = str(Path(temp) / 'missing.json')
            with self.assertRaises(RuntimeError):
                db._load()


class CacheTests(unittest.TestCase):
    def setUp(self):
        db.clear_cache()

    def test_immutable_reads_are_cached_and_writes_are_not(self):
        first = db.observations('gee_recovery', 2025, '25750')
        real_connect = db.connect
        db.connect = lambda: (_ for _ in ()).throw(AssertionError('a cached read must not open a connection'))
        try:
            self.assertEqual(db.observations('gee_recovery', 2025, '25750'), first)
            self.assertIs(db.observations('gee_recovery', 2025, '25750'), first)
        finally:
            db.connect = real_connect
        self.assertNotEqual(db.observations('gee_recovery', 2024, '25750'), first)   # other arguments are other entries
        self.assertFalse(hasattr(db.demo, 'cache_clear'))   # demo points stay live

    def test_cache_can_be_disabled_and_errors_are_not_cached(self):
        os.environ['MOBILEGIS_CACHE_SECONDS'] = '0'
        try:
            a = db.observations('gee_recovery', 2025, '25750')
            self.assertIsNot(db.observations('gee_recovery', 2025, '25750'), a)
        finally:
            os.environ.pop('MOBILEGIS_CACHE_SECONDS', None)
        with self.assertRaises(ValueError):
            db.observations('nope')
        with self.assertRaises(ValueError):
            db.observations('nope')


if __name__ == '__main__':
    unittest.main()
