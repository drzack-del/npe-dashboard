-- AWS only. On Supabase, Supabase Auth creates the auth.users row when someone signs up, and
-- the app then links that login to the person's tc_users row (fetchProfile, first sign-in).
-- On AWS, Cognito holds the logins and auth.users is a stand-in table, so nothing creates the
-- row and the link would fail its foreign key. This function does both steps for the caller:
-- records their own login (id and email straight from their verified access token) and links
-- it to the unlinked team-member row with that email. It cannot touch anyone else's login or
-- an already-linked row. The app calls it only in Cognito mode (VITE_AUTH_PROVIDER=cognito).
--
-- Run as cadenceiq_admin through the Data API: SET ROLE cadenceiq_owner, the statements below,
-- RESET ROLE, in one transaction, so the function is owned by cadenceiq_owner like the rest.
-- Undo: DROP FUNCTION public.link_my_login();

CREATE OR REPLACE FUNCTION public.link_my_login()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  my_email text := lower(nullif(auth.jwt() ->> 'email', ''));
BEGIN
  IF auth.uid() IS NULL OR my_email IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES (auth.uid(), my_email, now())
    ON CONFLICT (id) DO NOTHING;
  UPDATE public.tc_users
     SET auth_user_id = auth.uid()
   WHERE lower(email) = my_email
     AND auth_user_id IS NULL;
END $function$;

-- Supabase-style default privileges grant new functions to anon too; signed-out callers get none.
REVOKE ALL ON FUNCTION public.link_my_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_login() TO authenticated;
