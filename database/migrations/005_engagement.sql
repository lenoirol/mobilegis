-- MobileGIS engagement features (schema 5): saved areas, visitor feedback, site notice. Adds tables only; research tables are untouched.
CREATE TABLE IF NOT EXISTS mobilegis.user_favorites (
 user_id bigint NOT NULL REFERENCES mobilegis.app_users(id) ON DELETE CASCADE,
 code text NOT NULL CHECK(code ~ '^[0-9]{5}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,code)
);

CREATE TABLE IF NOT EXISTS mobilegis.feedback (
 id bigserial PRIMARY KEY,
 user_id bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL,
 code text CHECK(code IS NULL OR code ~ '^[0-9]{5}$'),
 kind text NOT NULL CHECK(kind IN ('data_error','suggestion','ui_error')),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 5 AND 1000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','done')),
 created_at timestamptz NOT NULL DEFAULT now(),
 handled_at timestamptz,
 handled_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS feedback_status ON mobilegis.feedback(status,created_at DESC);

CREATE TABLE IF NOT EXISTS mobilegis.site_settings (
 key text PRIMARY KEY CHECK(key IN ('notice')),
 value text NOT NULL CHECK(length(value)<=300),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL
);

INSERT INTO mobilegis.schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
