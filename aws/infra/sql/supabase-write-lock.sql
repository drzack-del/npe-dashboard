-- SWITCH-OVER, step 2: make the live Supabase database read-only for the app.
-- Run in the Supabase SQL Editor (or via the connector, with Dr. Miller's yes) right before the
-- final copy to AWS. Signed-in staff (authenticated) and signed-out visitors (anon) can still READ
-- everything they could before, but cannot insert, change or delete anything, so an old browser tab
-- still running the Supabase version of the app cannot save work after the final copy. The app shows
-- "Cloud save failed ... Saved locally only" for such a save; the person reloads and re-enters it on AWS.
-- service_role (Supabase's own functions, the copy-back script) is not affected.
-- Undo: supabase-write-unlock.sql. Rehearsed on production's structure in the local harness.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.patients, public.tc_users, public.practices, public.settings,
  public.practice_goals, public.practice_metrics, public.feedback
  FROM anon, authenticated;
COMMIT;
