-- MobileGIS accounts and roles (schema 4). Adds tables only; research tables are untouched.
-- Passwords are stored as scrypt hashes; session tokens and reset codes are stored hashed.
CREATE TABLE IF NOT EXISTS mobilegis.app_users (
 id bigserial PRIMARY KEY,
 email text NOT NULL CHECK(email=lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email)<=254),
 display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 100),
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 is_active boolean NOT NULL DEFAULT true,
 failed_logins integer NOT NULL DEFAULT 0 CHECK(failed_logins>=0),
 locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email ON mobilegis.app_users(email);

CREATE TABLE IF NOT EXISTS mobilegis.app_sessions (
 token_hash text PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES mobilegis.app_users(id) ON DELETE CASCADE,
 csrf_token text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user ON mobilegis.app_sessions(user_id);

-- A user asks to reset; an admin issues a one-time code and passes it on outside the system.
CREATE TABLE IF NOT EXISTS mobilegis.password_resets (
 id bigserial PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES mobilegis.app_users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','issued','used','cancelled')),
 code_hash text,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 requested_at timestamptz NOT NULL DEFAULT now(),
 issued_by bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL,
 issued_at timestamptz,
 expires_at timestamptz,
 CHECK(status NOT IN ('issued') OR (code_hash IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS password_resets_status ON mobilegis.password_resets(status,requested_at);

CREATE TABLE IF NOT EXISTS mobilegis.auth_events (
 id bigserial PRIMARY KEY,
 user_id bigint REFERENCES mobilegis.app_users(id) ON DELETE SET NULL,
 email text,
 event text NOT NULL,
 detail text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_events_time ON mobilegis.auth_events(created_at DESC);

INSERT INTO mobilegis.schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
