-- Run once on a new Aurora database, as the master user (cadenceiq_admin), BEFORE loading
-- aws/db/00_supabase_compat.sql and aws/db/prod-schema/production-schema.sql.
--
-- Why: on Supabase the table owner (postgres) bypasses row-level security, and the
-- SECURITY DEFINER helpers the policies call (get_my_practice_id, is_superadmin, ...) rely on
-- that, because every table has FORCE ROW LEVEL SECURITY. The Aurora master user is not a
-- superuser and does not bypass RLS, so tables owned by it would hide rows from those
-- helpers and every policy would fail closed. A dedicated owner role with BYPASSRLS mirrors
-- Supabase. (Aurora allows the master user to create BYPASSRLS roles; verified 2026-09-30.)
CREATE ROLE cadenceiq_owner NOLOGIN BYPASSRLS;
GRANT cadenceiq_owner TO cadenceiq_admin;
GRANT CREATE ON DATABASE cadenceiq TO cadenceiq_owner;
GRANT CREATE, USAGE ON SCHEMA public TO cadenceiq_owner;

-- Load order (all in ONE transaction through the RDS Data API, so a failure leaves nothing):
--   1. this file
--   2. from 00_supabase_compat.sql, the role statements only (the two DO blocks creating
--      anon/authenticated/service_role/authenticator, and GRANT ... TO authenticator),
--      as cadenceiq_admin
--   3. GRANT anon, authenticated, service_role, authenticator TO cadenceiq_admin
--      (lets the admin run the security checks as each role)
--   4. SET ROLE cadenceiq_owner, then the rest of 00_supabase_compat.sql and all of
--      production-schema.sql, so every object is owned by cadenceiq_owner
--   5. RESET ROLE, commit
-- The Data API runs one statement per call; statements are split on semicolons outside
-- quotes, dollar-quoted bodies and comments (verified to load identically on local Postgres).
