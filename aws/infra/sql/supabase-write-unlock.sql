-- SWITCHING BACK (or cancelling a switch-over): restore the app's normal write access on Supabase,
-- exactly as production had it before supabase-write-lock.sql (Supabase's defaults: ALL privileges
-- on these tables for anon and authenticated; row-level security still decides which rows).
-- Run AFTER any copy-back of work done on AWS has finished and been verified.
BEGIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON
  public.patients, public.tc_users, public.practices, public.settings,
  public.practice_goals, public.practice_metrics, public.feedback
  TO anon, authenticated;
COMMIT;
