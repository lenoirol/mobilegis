-- MobileGIS field tests (schema 7): speed runs measured on real phones and the short usability survey. Adds tables only.
-- Anonymous on purpose: no user id, no IP address, no user agent string.
CREATE TABLE IF NOT EXISTS mobilegis.perf_runs (
 id bigserial PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 device text NOT NULL CHECK(length(trim(device)) BETWEEN 1 AND 120),
 screen text CHECK(screen IS NULL OR length(screen)<=60),
 connection text NOT NULL CHECK(connection IN ('wifi','mobile','other')),
 net_info text CHECK(net_info IS NULL OR length(net_info)<=60),
 first_map_ms integer CHECK(first_map_ms IS NULL OR first_map_ms BETWEEN 0 AND 120000),
 first_open boolean NOT NULL DEFAULT false,
 layer_ms integer[] NOT NULL DEFAULT '{}' CHECK(cardinality(layer_ms)<=12),
 layer_median_ms integer CHECK(layer_median_ms IS NULL OR layer_median_ms BETWEEN 0 AND 60000),
 note text CHECK(note IS NULL OR length(note)<=200)
);
CREATE INDEX IF NOT EXISTS perf_runs_created ON mobilegis.perf_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS mobilegis.survey_responses (
 id bigserial PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 participant text CHECK(participant IS NULL OR length(participant)<=40),
 device text CHECK(device IS NULL OR length(device)<=120),
 tasks jsonb NOT NULL,       -- {"T1":{"done":true,"taps":0}, ... "T5":{...}}
 ratings jsonb NOT NULL,     -- {"easy":1-5,"legend":1-5,"trust":1-5,"useful":1-5}
 comment text CHECK(comment IS NULL OR length(comment)<=500)
);
CREATE INDEX IF NOT EXISTS survey_created ON mobilegis.survey_responses(created_at DESC);

INSERT INTO mobilegis.schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
