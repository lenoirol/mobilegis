-- MobileGIS schema 8: admin data imports (an overlay on the published per-commune observations; published rows are never edited).
CREATE TABLE IF NOT EXISTS mobilegis.observation_imports (
 id bigserial PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL,
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 120),
 sha256 text NOT NULL,
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','reverted')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=300),
 rows jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS observation_imports_status ON mobilegis.observation_imports(status, id);
-- Usage counters also count features and UI errors (anonymous totals per day).
ALTER TABLE mobilegis.usage_counts DROP CONSTRAINT IF EXISTS usage_counts_kind_check;
ALTER TABLE mobilegis.usage_counts ADD CONSTRAINT usage_counts_kind_check CHECK(kind IN ('area','layer','page','feature','error'));
INSERT INTO mobilegis.schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
