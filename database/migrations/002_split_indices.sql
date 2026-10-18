-- PG1 -> PG2, executed inside the import transaction under its advisory lock.
-- Preserve scalar data before removing the redundant parent columns.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='mobilegis.unit_observations'::regclass AND conname='observation_sample_key') THEN
    ALTER TABLE mobilegis.unit_observations ADD CONSTRAINT observation_sample_key UNIQUE(dataset_id,code,year,sampled_pixels);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mobilegis.lst_observations (
  dataset_id text NOT NULL,code text NOT NULL,year integer NOT NULL,
  lst double precision CHECK(lst IS NULL OR lst BETWEEN -80 AND 100),
  valid_pixels integer NOT NULL, sampled_pixels integer NOT NULL CHECK(sampled_pixels>0),
  coverage double precision NOT NULL CHECK(coverage BETWEEN 0 AND 1),
  PRIMARY KEY(dataset_id,code,year),
  FOREIGN KEY(dataset_id,code,year,sampled_pixels) REFERENCES mobilegis.unit_observations(dataset_id,code,year,sampled_pixels),
  CHECK(valid_pixels BETWEEN 0 AND sampled_pixels),
  CHECK(abs(coverage-valid_pixels::double precision/sampled_pixels)<=CASE WHEN dataset_id='legacy' THEN 0.00005000001 ELSE 1e-12 END),
  CHECK(lst IS NULL OR (valid_pixels>=5 AND coverage>=0.1))
);
CREATE TABLE IF NOT EXISTS mobilegis.ndvi_observations (
  dataset_id text NOT NULL,code text NOT NULL,year integer NOT NULL,
  ndvi double precision CHECK(ndvi IS NULL OR ndvi BETWEEN -1 AND 1),
  valid_pixels integer NOT NULL, sampled_pixels integer NOT NULL CHECK(sampled_pixels>0),
  coverage double precision NOT NULL CHECK(coverage BETWEEN 0 AND 1),
  PRIMARY KEY(dataset_id,code,year),
  FOREIGN KEY(dataset_id,code,year,sampled_pixels) REFERENCES mobilegis.unit_observations(dataset_id,code,year,sampled_pixels),
  CHECK(valid_pixels BETWEEN 0 AND sampled_pixels),
  CHECK(abs(coverage-valid_pixels::double precision/sampled_pixels)<=CASE WHEN dataset_id='legacy' THEN 0.00005000001 ELSE 1e-12 END),
  CHECK(ndvi IS NULL OR (valid_pixels>=5 AND coverage>=0.1))
);
CREATE TABLE IF NOT EXISTS mobilegis.tvdi_observations (
  dataset_id text NOT NULL,code text NOT NULL,year integer NOT NULL,
  tvdi double precision CHECK(tvdi IS NULL OR tvdi BETWEEN 0 AND 1),
  valid_pixels integer NOT NULL, sampled_pixels integer NOT NULL CHECK(sampled_pixels>0),
  coverage double precision NOT NULL CHECK(coverage BETWEEN 0 AND 1),
  PRIMARY KEY(dataset_id,code,year),
  FOREIGN KEY(dataset_id,code,year,sampled_pixels) REFERENCES mobilegis.unit_observations(dataset_id,code,year,sampled_pixels),
  CHECK(valid_pixels BETWEEN 0 AND sampled_pixels),
  CHECK(abs(coverage-valid_pixels::double precision/sampled_pixels)<=CASE WHEN dataset_id='legacy' THEN 0.00005000001 ELSE 1e-12 END),
  CHECK(tvdi IS NULL OR (valid_pixels>=5 AND coverage>=0.1))
);
CREATE INDEX IF NOT EXISTS lst_year_value ON mobilegis.lst_observations(dataset_id,year,lst) WHERE lst IS NOT NULL;
CREATE INDEX IF NOT EXISTS ndvi_year_value ON mobilegis.ndvi_observations(dataset_id,year,ndvi) WHERE ndvi IS NOT NULL;
CREATE INDEX IF NOT EXISTS tvdi_year_value ON mobilegis.tvdi_observations(dataset_id,year,tvdi) WHERE tvdi IS NOT NULL;

DO $$ DECLARE k text; different boolean; BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='mobilegis' AND table_name='unit_observations' AND column_name='lst') THEN
    FOREACH k IN ARRAY ARRAY['lst','ndvi','tvdi'] LOOP
      EXECUTE format('INSERT INTO mobilegis.%I_observations SELECT dataset_id,code,year,%I,%I_pixels,sampled_pixels,%I_coverage FROM mobilegis.unit_observations ON CONFLICT DO NOTHING',k,k,k,k);
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM mobilegis.unit_observations o LEFT JOIN mobilegis.%I_observations m USING(dataset_id,code,year) WHERE m.dataset_id IS NULL OR m.%I IS DISTINCT FROM o.%I OR m.valid_pixels<>o.%I_pixels OR m.coverage<>o.%I_coverage OR m.sampled_pixels<>o.sampled_pixels)',k,k,k,k,k) INTO different;
      IF different THEN RAISE EXCEPTION 'Metric copy differs; migration rolled back'; END IF;
    END LOOP;
    ALTER TABLE mobilegis.unit_observations DROP COLUMN lst, DROP COLUMN ndvi, DROP COLUMN tvdi,
      DROP COLUMN lst_pixels, DROP COLUMN ndvi_pixels, DROP COLUMN tvdi_pixels,
      DROP COLUMN lst_coverage, DROP COLUMN ndvi_coverage, DROP COLUMN tvdi_coverage;
  END IF;
END $$;

CREATE OR REPLACE VIEW mobilegis.observations_combined AS
 SELECT o.*,l.lst,n.ndvi,t.tvdi,
   l.valid_pixels AS lst_pixels,n.valid_pixels AS ndvi_pixels,t.valid_pixels AS tvdi_pixels,
   l.coverage AS lst_coverage,n.coverage AS ndvi_coverage,t.coverage AS tvdi_coverage
 FROM mobilegis.unit_observations o
 JOIN mobilegis.lst_observations l USING(dataset_id,code,year)
 JOIN mobilegis.ndvi_observations n USING(dataset_id,code,year)
 JOIN mobilegis.tvdi_observations t USING(dataset_id,code,year);

ALTER TABLE mobilegis.admin_units ADD COLUMN IF NOT EXISTS geom_original geometry(MultiPolygon,4326);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='mobilegis.admin_units'::regclass AND conname='original_geometry_valid') THEN
  ALTER TABLE mobilegis.admin_units ADD CONSTRAINT original_geometry_valid CHECK(ST_IsValid(geom_original) AND NOT ST_IsEmpty(geom_original));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS admin_original_geom ON mobilegis.admin_units USING gist(geom_original);
-- Importer fills/validates original polygons and all three metric tables,
-- then records schema version 2; any failure rolls the whole transaction back.
