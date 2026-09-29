-- Supabase compatibility layer for plain Postgres (local test / AWS RDS).
--
-- The CadenceIQ migrations and security policies only depend on four Supabase pieces:
--   * roles anon / authenticated / service_role
--   * auth.uid() and auth.jwt(), which read the caller's JWT claims
--   * the auth.users table (id, email, email_confirmed_at, is_anonymous)
--   * Supabase's default grants on the public schema
-- This file recreates exactly those, with the same semantics Supabase uses: the API layer
-- verifies the login token, then per transaction runs
--   SELECT set_config('request.jwt.claims', '<claims json>', true);
--   SET LOCAL ROLE authenticated;
-- and every existing RLS policy keeps working unchanged.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- Supabase's service_role bypasses RLS. TODO(RDS): confirm the RDS master user may
    -- grant BYPASSRLS; if not, server-side functions connect as the table owner instead.
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- The login role the API connects as; it only ever switches into the three roles above.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS auth;

-- Mirrors the columns of Supabase's auth.users that the migrations read.
-- On AWS, rows are kept in sync with Cognito (id = Cognito sub).
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  is_anonymous       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Same definitions Supabase ships (supports both the legacy per-claim setting and the
-- current single JSON setting).
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role(), auth.email() TO anon, authenticated, service_role;
GRANT ALL ON auth.users TO service_role;

-- Supabase's default privileges on public: every new table/function/sequence is granted to
-- the API roles, and RLS policies (plus the explicit REVOKEs in the hardening migration)
-- decide what they can actually touch. Reproduced so the migrations behave identically.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
