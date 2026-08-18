-- Location-scoped logins: a user pinned to one location, who sees that location's
-- patients and nothing else. Built for Dr. Casey Lynn, who owns the Apollo Beach
-- location, and reusable for any future per-location owner.
--
-- Run in the Supabase SQL Editor (Dashboard > SQL Editor), same as the earlier
-- migrations in this folder.
--
-- Three things happen here, and the first is a security fix that has to land
-- whether or not you ship the new role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SECURITY FIX: is_superadmin() was practice-based, not role-based
-- ─────────────────────────────────────────────────────────────────────────────
-- The old definition returned true for EVERY user whose practice_id is
-- 'miller-ortho' -- treatment coordinators included. Since every patients /
-- settings / practice_metrics / practice_goals policy ends in `OR
-- is_superadmin()`, that granted every Miller Ortho staff login:
--
--   * read access to EVERY practice's patient rows, not just Miller's
--   * read + delete on the cross-practice feedback inbox
--   * insert/update/delete on the practices table itself
--
-- The app already assumes superadmin means "an admin at Miller Ortho" -- the
-- superadmin panel is gated on `practiceId === 'miller-ortho' && role ===
-- 'admin'` (src/App.jsx:1245). This aligns the database with that assumption.
--
-- It is also a hard precondition for location scoping: a scoped user sitting in
-- miller-ortho would otherwise satisfy `OR is_superadmin()` and read everything,
-- making the location predicate below decorative.
--
-- Effect on existing logins: Dr. Miller (admin @ miller-ortho) is unchanged.
-- Treatment coordinators and office managers lose cross-practice access they
-- were never meant to have and that the UI never offered them.
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((
    SELECT practice_id = 'miller-ortho' AND role = 'admin'
    FROM tc_users
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  ), false);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The column, the role, and the scope helper
-- ─────────────────────────────────────────────────────────────────────────────

-- Nullable on purpose: NULL means "no location scope", which is exactly today's
-- behaviour. Every existing row keeps working untouched.
ALTER TABLE tc_users ADD COLUMN IF NOT EXISTS location_scope text;

COMMENT ON COLUMN tc_users.location_scope IS
  'When set, this login sees only patients whose location matches this value. '
  'Must match a string in the practice''s settings.locations list (e.g. ''Apo''). '
  'NULL = full practice.';

-- location_scope has to match patients.location exactly, which in this app is
-- a short internal code ("Car", "Apo") rather than a name anyone outside the
-- practice would recognize. location_label is the human-readable form shown
-- on screen ("Apollo Beach") -- cosmetic only, never used for filtering, so a
-- typo here can't leak another location's data.
ALTER TABLE tc_users ADD COLUMN IF NOT EXISTS location_label text;

COMMENT ON COLUMN tc_users.location_label IS
  'Display name for location_scope (e.g. ''Apollo Beach'' for the code ''Apo''). '
  'Cosmetic only -- filtering uses location_scope. Falls back to location_scope '
  'in the UI when unset.';

-- The role CHECK constraint rejects unknown roles outright (see
-- 20260725_allow_manager_role.sql, where adding ''manager'' failed silently for
-- exactly this reason). Add the new tier before the app tries to insert it.
ALTER TABLE tc_users DROP CONSTRAINT IF EXISTS tc_users_role_check;
ALTER TABLE tc_users ADD CONSTRAINT tc_users_role_check
  CHECK (role IN ('tc', 'admin', 'manager', 'location_owner'));

-- A location_owner without a scope would see the whole practice -- the opposite
-- of the point. Refuse that row rather than silently over-share.
ALTER TABLE tc_users DROP CONSTRAINT IF EXISTS tc_users_location_scope_check;
ALTER TABLE tc_users ADD CONSTRAINT tc_users_location_scope_check
  CHECK (role <> 'location_owner' OR location_scope IS NOT NULL);

CREATE OR REPLACE FUNCTION get_my_location_scope()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT location_scope FROM tc_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policies: scoped read, no writes
-- ─────────────────────────────────────────────────────────────────────────────
-- Every policy below follows the same shape:
--   unscoped user (location_scope IS NULL) -> unchanged behaviour
--   scoped user                            -> their location only, read only
--
-- Written as DROP + CREATE because Postgres has no CREATE OR REPLACE POLICY.

-- PATIENTS ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "patients_select" ON patients;
CREATE POLICY "patients_select" ON patients
  FOR SELECT TO authenticated
  USING (
    (
      practice_id = get_my_practice_id()
      AND (
        get_my_location_scope() IS NULL
        OR location = get_my_location_scope()
      )
    )
    OR is_superadmin()
  );

-- A scoped login is read-only. This is what makes "All Patients, read-only"
-- true rather than merely un-clicked: hiding the Delete button stops the click,
-- this stops the request.
DROP POLICY IF EXISTS "patients_insert" ON patients;
CREATE POLICY "patients_insert" ON patients
  FOR INSERT TO authenticated
  WITH CHECK (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "patients_update" ON patients;
CREATE POLICY "patients_update" ON patients
  FOR UPDATE TO authenticated
  USING (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "patients_delete" ON patients;
CREATE POLICY "patients_delete" ON patients
  FOR DELETE TO authenticated
  USING (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

-- SETTINGS ───────────────────────────────────────────────────────────────────
-- Read stays open: the app needs settings.locations and the Medicaid flag to
-- render at all. Writes close, so a scoped login cannot edit goals, locations,
-- or anything else practice-wide.
DROP POLICY IF EXISTS "settings_insert" ON settings;
CREATE POLICY "settings_insert" ON settings
  FOR INSERT TO authenticated
  WITH CHECK (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "settings_update" ON settings;
CREATE POLICY "settings_update" ON settings
  FOR UPDATE TO authenticated
  USING (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

-- PRACTICE_METRICS + PRACTICE_GOALS ──────────────────────────────────────────
-- Both are practice-wide by definition and cannot be split by location, so a
-- scoped login should not read them at all. The Practice Metrics tab is hidden
-- for this role; this makes the data unreachable rather than merely unlinked.
DROP POLICY IF EXISTS "practice_metrics_select" ON practice_metrics;
CREATE POLICY "practice_metrics_select" ON practice_metrics
  FOR SELECT TO authenticated
  USING (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "practice_goals_select" ON practice_goals;
CREATE POLICY "practice_goals_select" ON practice_goals
  FOR SELECT TO authenticated
  USING (
    (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

-- TC_USERS ───────────────────────────────────────────────────────────────────
-- Teammate visibility narrows to their own row. A partner-owner has no reason to
-- read the staff roster, and the roster carries emails and bonus configuration.
DROP POLICY IF EXISTS "tc_users_select" ON tc_users;
CREATE POLICY "tc_users_select" ON tc_users
  FOR SELECT TO authenticated
  USING (
    email = auth.jwt()->>'email'
    OR (practice_id = get_my_practice_id() AND get_my_location_scope() IS NULL)
    OR is_superadmin()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verifying, once this has run
-- ─────────────────────────────────────────────────────────────────────────────
-- Sign in as the scoped user and check the row counts match the location:
--   SELECT location, count(*) FROM patients GROUP BY location;
-- A scoped login must see exactly one location. If more than one comes back,
-- is_superadmin() is still returning true for them -- check their role.
