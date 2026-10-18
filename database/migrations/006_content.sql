-- MobileGIS editorial content and anonymous usage counters (schema 6). Adds tables only; research tables are untouched.
CREATE TABLE IF NOT EXISTS mobilegis.area_notes (
 code text PRIMARY KEY CHECK(code ~ '^[0-9]{5}$'),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 500),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mobilegis.highlights (
 id bigserial PRIMARY KEY,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 400),
 code text CHECK(code IS NULL OR code ~ '^[0-9]{5}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL
);

-- Anonymous counters only: no user id, no IP, no user agent.
CREATE TABLE IF NOT EXISTS mobilegis.usage_counts (
 day date NOT NULL DEFAULT current_date,
 kind text NOT NULL CHECK(kind IN ('area','layer','page')),
 key text NOT NULL CHECK(length(key)<=16),
 n integer NOT NULL DEFAULT 0 CHECK(n>=0),
 PRIMARY KEY(day,kind,key)
);

INSERT INTO mobilegis.schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
