-- PG3: additive migration. Original observations and raster bytes are unchanged.
ALTER TABLE mobilegis.datasets ADD COLUMN IF NOT EXISTS result_kind text NOT NULL DEFAULT 'observed';
ALTER TABLE mobilegis.datasets DROP CONSTRAINT IF EXISTS datasets_result_kind_check;
ALTER TABLE mobilegis.datasets ADD CONSTRAINT datasets_result_kind_check
 CHECK(result_kind IN ('observed','forecast','simulation','unverified'));
UPDATE mobilegis.datasets SET result_kind=CASE WHEN kind='demo' THEN 'simulation'
 WHEN kind='user_points' THEN 'unverified' ELSE 'observed' END;
ALTER TABLE mobilegis.unit_observations DROP CONSTRAINT IF EXISTS unit_observations_year_check;
ALTER TABLE mobilegis.unit_observations ADD CONSTRAINT unit_observations_year_check CHECK(year BETWEEN 1900 AND 2200);

CREATE TABLE IF NOT EXISTS mobilegis.pixel_statistics (
 dataset_id text NOT NULL, code text NOT NULL, year integer NOT NULL,
 index_name text NOT NULL CHECK(index_name IN ('lst','ndvi','tvdi')),
 sample_count integer NOT NULL CHECK(sample_count>=0),
 valid_count integer NOT NULL CHECK(valid_count BETWEEN 0 AND sample_count),
 minimum double precision, maximum double precision, mean double precision,
 median double precision, stddev double precision, q25 double precision, q75 double precision,
 histogram jsonb NOT NULL, method text NOT NULL, raster_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(dataset_id,code,year,index_name),
 FOREIGN KEY(dataset_id,code,year) REFERENCES mobilegis.unit_observations(dataset_id,code,year),
 CHECK((valid_count=0 AND mean IS NULL) OR (valid_count>0 AND mean IS NOT NULL)),
 CHECK(minimum<=q25 AND q25<=median AND median<=q75 AND q75<=maximum),
 CHECK(stddev>=0)
);
CREATE TABLE IF NOT EXISTS mobilegis.index_landcover_statistics (
 dataset_id text NOT NULL, code text NOT NULL, year integer NOT NULL,
 index_name text NOT NULL, class_code integer NOT NULL, class_name text NOT NULL,
 reference_year integer NOT NULL CHECK(reference_year=2021),
 valid_count integer NOT NULL CHECK(valid_count>0), mean double precision NOT NULL,
 method text NOT NULL,
 PRIMARY KEY(dataset_id,code,year,index_name,class_code),
 FOREIGN KEY(dataset_id,code,year,index_name)
 REFERENCES mobilegis.pixel_statistics(dataset_id,code,year,index_name)
);
CREATE TABLE IF NOT EXISTS mobilegis.analysis_runs (
 id uuid PRIMARY KEY, title text NOT NULL,
 result_kind text NOT NULL CHECK(result_kind IN ('forecast','simulation')),
 source_dataset_id text NOT NULL REFERENCES mobilegis.datasets(id),
 boundary_id text NOT NULL REFERENCES mobilegis.boundary_versions(id),
 base_year integer NOT NULL CHECK(base_year BETWEEN 1900 AND 2200),
 target_year integer NOT NULL CHECK(target_year BETWEEN 1900 AND 2200),
 method text NOT NULL, method_version text NOT NULL, parameters jsonb NOT NULL,
 training_period jsonb, note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL DEFAULT session_user,
 UNIQUE(id,boundary_id), CHECK(result_kind<>'forecast' OR target_year>base_year)
);
CREATE TABLE IF NOT EXISTS mobilegis.result_units (
 run_id uuid NOT NULL, boundary_id text NOT NULL, code text NOT NULL, year integer NOT NULL,
 PRIMARY KEY(run_id,code,year),
 FOREIGN KEY(run_id,boundary_id) REFERENCES mobilegis.analysis_runs(id,boundary_id),
 FOREIGN KEY(boundary_id,code) REFERENCES mobilegis.admin_units(boundary_id,code)
);
-- Separate metric result tables; predictions never inherit pixel-count constraints.
CREATE TABLE IF NOT EXISTS mobilegis.lst_results (
 run_id uuid NOT NULL,code text NOT NULL,year integer NOT NULL,
 value double precision CHECK(value BETWEEN -80 AND 100),
 lower_bound double precision,upper_bound double precision,status text NOT NULL,
 PRIMARY KEY(run_id,code,year), FOREIGN KEY(run_id,code,year) REFERENCES mobilegis.result_units,
 CHECK(lower_bound IS NULL OR lower_bound<=value), CHECK(upper_bound IS NULL OR upper_bound>=value)
);
CREATE TABLE IF NOT EXISTS mobilegis.ndvi_results (
 run_id uuid NOT NULL,code text NOT NULL,year integer NOT NULL,
 value double precision CHECK(value BETWEEN -1 AND 1),
 lower_bound double precision,upper_bound double precision,status text NOT NULL,
 PRIMARY KEY(run_id,code,year), FOREIGN KEY(run_id,code,year) REFERENCES mobilegis.result_units,
 CHECK(lower_bound IS NULL OR lower_bound<=value), CHECK(upper_bound IS NULL OR upper_bound>=value)
);
CREATE TABLE IF NOT EXISTS mobilegis.tvdi_results (
 run_id uuid NOT NULL,code text NOT NULL,year integer NOT NULL,
 value double precision CHECK(value BETWEEN 0 AND 1),
 lower_bound double precision,upper_bound double precision,status text NOT NULL,
 PRIMARY KEY(run_id,code,year), FOREIGN KEY(run_id,code,year) REFERENCES mobilegis.result_units,
 CHECK(lower_bound IS NULL OR lower_bound<=value), CHECK(upper_bound IS NULL OR upper_bound>=value)
);
CREATE TABLE IF NOT EXISTS mobilegis.model_evaluations (
 run_id uuid NOT NULL REFERENCES mobilegis.analysis_runs(id),
 index_name text NOT NULL CHECK(index_name IN ('lst','ndvi','tvdi')),
 reference_dataset_id text NOT NULL REFERENCES mobilegis.datasets(id),
 validation_method text NOT NULL, sample_count integer NOT NULL CHECK(sample_count>0),
 rmse double precision NOT NULL CHECK(rmse>=0),mae double precision NOT NULL CHECK(mae>=0),
 bias double precision NOT NULL,details jsonb NOT NULL,
 PRIMARY KEY(run_id,index_name,reference_dataset_id)
);
CREATE INDEX IF NOT EXISTS statistics_filter ON mobilegis.pixel_statistics(dataset_id,year,index_name);
CREATE INDEX IF NOT EXISTS analysis_runs_kind ON mobilegis.analysis_runs(result_kind,created_at);
INSERT INTO mobilegis.schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
