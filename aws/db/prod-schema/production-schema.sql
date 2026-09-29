-- STRUCTURE of the production CadenceIQ database (Supabase project ntb-npe-dashboard),
-- read on 2026-09-29 from the system catalogs through the Supabase connector: tables,
-- columns, defaults, constraints, row-level security, policies, functions, triggers and grants
-- for the app's `public` schema. No rows of data were read or are contained here.
--
-- Production at that time had every migration up to 20260924163022_transfer_patient_flag.sql
-- plus the team-member identity lock (guard_tc_users_update) applied, and had NOT yet run
-- 20260927210232_tenant_security_hardening.sql or 20260928013000_office_onboarding.sql (there
-- is no `private` schema in production). APPLIED_THROUGH names the last applied migration file;
-- the local tests load this file, then apply only the migrations after it.
--
-- Refresh this file whenever a migration is run in production.

-- ── Sequences ────────────────────────────────────────────────────────────────
CREATE SEQUENCE public.practice_goals_id_seq AS bigint;
CREATE SEQUENCE public.practice_metrics_id_seq AS bigint;

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE public.practices (
  id       text NOT NULL,
  name     text NOT NULL,
  location text,
  CONSTRAINT practices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tc_users (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id   uuid,
  name           text NOT NULL,
  email          text NOT NULL,
  role           text NOT NULL DEFAULT 'tc'::text,
  practice_id    text,
  status         text NOT NULL DEFAULT 'active'::text,
  created_at     timestamp with time zone DEFAULT now(),
  bonus_enabled  boolean NOT NULL DEFAULT false,
  bonus_rates    jsonb,
  location_scope text,
  location_label text,
  CONSTRAINT tc_users_pkey PRIMARY KEY (id),
  CONSTRAINT tc_users_email_key UNIQUE (email),
  CONSTRAINT tc_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tc_users_location_scope_check CHECK (((role <> 'location_owner'::text) OR (location_scope IS NOT NULL))),
  CONSTRAINT tc_users_role_check CHECK ((role = ANY (ARRAY['tc'::text, 'admin'::text, 'manager'::text, 'location_owner'::text]))),
  CONSTRAINT tc_users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

CREATE TABLE public.patients (
  id                    text NOT NULL,
  name                  text NOT NULL,
  npe_date              text NOT NULL,
  location              text NOT NULL,
  dp                    text DEFAULT '$0'::text,
  tc                    text DEFAULT 'Reaghan'::text,
  br                    boolean DEFAULT false,
  inv                   boolean DEFAULT false,
  ph1                   boolean DEFAULT false,
  ph2                   boolean DEFAULT false,
  ltd                   boolean DEFAULT false,
  r_plus                boolean DEFAULT false,
  w_plus                boolean DEFAULT false,
  pif                   boolean DEFAULT false,
  st                    boolean DEFAULT false,
  sch                   boolean DEFAULT false,
  pen                   boolean DEFAULT false,
  obs                   boolean DEFAULT false,
  mp                    boolean DEFAULT false,
  notx                  boolean DEFAULT false,
  obstacle              text DEFAULT ''::text,
  notes                 text DEFAULT ''::text,
  contact_attempts      integer DEFAULT 0,
  next_touch_date       text DEFAULT ''::text,
  last_contact_date     text DEFAULT ''::text,
  contact_log           jsonb DEFAULT '[]'::jsonb,
  created_at            timestamp with time zone DEFAULT now(),
  phone                 text DEFAULT ''::text,
  start_date            text DEFAULT ''::text,
  bond_date             text DEFAULT ''::text,
  practice_id           text DEFAULT 'miller-ortho'::text,
  from_pending          boolean DEFAULT false,
  dbrets                boolean DEFAULT false,
  age                   integer,
  insurance_type        text,
  contract_amount       text,
  insurance_workflow    jsonb,
  obs_appt_date         text,
  obs_anticipated_date  text,
  medicaid_pipeline     boolean DEFAULT false,
  is_medicaid           boolean DEFAULT false,
  financed_months       integer,
  treatment_months      integer,
  addon_skip_reason     text DEFAULT ''::text,
  third_party_financing boolean NOT NULL DEFAULT false,
  is_transfer_patient   boolean DEFAULT false,
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_financed_months_check CHECK (((financed_months IS NULL) OR ((financed_months >= 0) AND (financed_months <= 120)))),
  CONSTRAINT patients_treatment_months_check CHECK (((treatment_months IS NULL) OR ((treatment_months >= 1) AND (treatment_months <= 120))))
);

CREATE TABLE public.feedback (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  practice_id  text,
  tc_name      text,
  tc_email     text,
  view         text,
  category     text,
  description  text,
  created_at   timestamp with time zone DEFAULT now(),
  needs_review boolean DEFAULT false,
  CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

CREATE TABLE public.settings (
  key         text NOT NULL,
  value       jsonb NOT NULL,
  practice_id text NOT NULL DEFAULT 'miller-ortho'::text,
  CONSTRAINT settings_pkey PRIMARY KEY (key, practice_id),
  CONSTRAINT settings_key_practice_id_unique UNIQUE (key, practice_id)
);

CREATE TABLE public.practice_metrics (
  id              bigint NOT NULL DEFAULT nextval('public.practice_metrics_id_seq'::regclass),
  year            integer NOT NULL,
  month           integer NOT NULL,
  net_production  numeric(12,2),
  collections     numeric(12,2),
  npe_scheduled   integer,
  npe_showed      integer,
  obs_added       integer DEFAULT 0,
  starts          integer,
  show_up_rate    numeric(5,4),
  conversion_rate numeric(5,4),
  avg_case_fee    numeric(10,2),
  notes           text,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  practice_id     text DEFAULT 'miller-ortho'::text,
  CONSTRAINT practice_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT practice_metrics_year_month_practice_key UNIQUE (year, month, practice_id),
  CONSTRAINT practice_metrics_month_check CHECK (((month >= 1) AND (month <= 12)))
);

CREATE TABLE public.practice_goals (
  id                bigint NOT NULL DEFAULT nextval('public.practice_goals_id_seq'::regclass),
  year              integer NOT NULL,
  month             integer,
  production_goal   numeric(12,2),
  npe_goal          integer,
  start_goal        integer,
  conversion_goal   numeric(5,4),
  avg_case_fee_goal numeric(10,2),
  show_up_rate_goal numeric(5,4),
  created_at        timestamp with time zone DEFAULT now(),
  practice_id       text DEFAULT 'miller-ortho'::text,
  CONSTRAINT practice_goals_pkey PRIMARY KEY (id),
  CONSTRAINT practice_goals_year_month_practice_key UNIQUE (year, month, practice_id),
  CONSTRAINT practice_goals_month_check CHECK (((month >= 1) AND (month <= 12)))
);

ALTER SEQUENCE public.practice_goals_id_seq OWNED BY public.practice_goals.id;
ALTER SEQUENCE public.practice_metrics_id_seq OWNED BY public.practice_metrics.id;

-- ── Functions ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_tc_email(user_email text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (SELECT 1 FROM tc_users WHERE lower(email) = lower(user_email));
$function$;

CREATE OR REPLACE FUNCTION public.get_my_location_scope()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT location_scope FROM tc_users WHERE auth_user_id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_practice_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT practice_id FROM tc_users WHERE auth_user_id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE((
    SELECT practice_id = 'miller-ortho' AND role = 'admin'
    FROM tc_users
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.guard_tc_users_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller_is_admin boolean;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF NEW.practice_id IS DISTINCT FROM OLD.practice_id
     OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
    RAISE EXCEPTION 'Only the platform owner can change a team member''s practice or email'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     AND NOT (OLD.auth_user_id IS NULL AND NEW.auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'A team member''s login link cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM tc_users me
    WHERE me.auth_user_id = auth.uid()
      AND me.practice_id = OLD.practice_id
      AND me.role = 'admin'
      AND me.status = 'active'
      AND me.location_scope IS NULL
  ) INTO caller_is_admin;

  IF caller_is_admin THEN
    IF OLD.auth_user_id = auth.uid()
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'You cannot change your own role or status'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'auth_user_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'auth_user_id' - 'updated_at') THEN
    RAISE EXCEPTION 'Only a practice admin can change team member details'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER guard_tc_users_update BEFORE UPDATE ON public.tc_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_tc_users_update();

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_goals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tc_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patients         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practice_goals   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practice_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.practices        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tc_users         FORCE ROW LEVEL SECURITY;

CREATE POLICY feedback_delete ON public.feedback FOR DELETE TO authenticated USING (is_superadmin());
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO authenticated USING (is_superadmin());

CREATE POLICY patients_delete ON public.patients FOR DELETE TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY patients_insert ON public.patients FOR INSERT TO authenticated
  WITH CHECK ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY patients_select ON public.patients FOR SELECT TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND ((get_my_location_scope() IS NULL) OR (location = get_my_location_scope()))) OR is_superadmin()));
CREATE POLICY patients_update ON public.patients FOR UPDATE TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));

CREATE POLICY practice_goals_delete ON public.practice_goals FOR DELETE TO authenticated
  USING (((practice_id = get_my_practice_id()) OR is_superadmin()));
CREATE POLICY practice_goals_insert ON public.practice_goals FOR INSERT TO authenticated
  WITH CHECK (((practice_id = get_my_practice_id()) OR is_superadmin()));
CREATE POLICY practice_goals_select ON public.practice_goals FOR SELECT TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY practice_goals_update ON public.practice_goals FOR UPDATE TO authenticated
  USING (((practice_id = get_my_practice_id()) OR is_superadmin()));

CREATE POLICY practice_metrics_delete ON public.practice_metrics FOR DELETE TO authenticated
  USING (((practice_id = get_my_practice_id()) OR is_superadmin()));
CREATE POLICY practice_metrics_insert ON public.practice_metrics FOR INSERT TO authenticated
  WITH CHECK (((practice_id = get_my_practice_id()) OR is_superadmin()));
CREATE POLICY practice_metrics_select ON public.practice_metrics FOR SELECT TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY practice_metrics_update ON public.practice_metrics FOR UPDATE TO authenticated
  USING (((practice_id = get_my_practice_id()) OR is_superadmin()));

CREATE POLICY practices_delete_superadmin ON public.practices FOR DELETE TO authenticated USING (is_superadmin());
CREATE POLICY practices_insert_superadmin ON public.practices FOR INSERT TO authenticated WITH CHECK (is_superadmin());
CREATE POLICY practices_select_auth ON public.practices FOR SELECT TO authenticated USING (true);
CREATE POLICY practices_update_superadmin ON public.practices FOR UPDATE TO authenticated USING (is_superadmin());

CREATE POLICY settings_insert ON public.settings FOR INSERT TO authenticated
  WITH CHECK ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated
  USING (((practice_id = get_my_practice_id()) OR is_superadmin()));
CREATE POLICY settings_update ON public.settings FOR UPDATE TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));

CREATE POLICY tc_users_delete ON public.tc_users FOR DELETE TO authenticated
  USING ((((practice_id = get_my_practice_id()) AND (EXISTS ( SELECT 1
   FROM tc_users tc_users_1
  WHERE ((tc_users_1.auth_user_id = auth.uid()) AND (tc_users_1.role = 'admin'::text))))) OR is_superadmin()));
CREATE POLICY tc_users_insert ON public.tc_users FOR INSERT TO authenticated
  WITH CHECK ((((practice_id = get_my_practice_id()) AND (EXISTS ( SELECT 1
   FROM tc_users tc_users_1
  WHERE ((tc_users_1.auth_user_id = auth.uid()) AND (tc_users_1.role = 'admin'::text))))) OR is_superadmin()));
CREATE POLICY tc_users_select ON public.tc_users FOR SELECT TO authenticated
  USING (((email = (auth.jwt() ->> 'email'::text)) OR ((practice_id = get_my_practice_id()) AND (get_my_location_scope() IS NULL)) OR is_superadmin()));
CREATE POLICY tc_users_update ON public.tc_users FOR UPDATE TO authenticated
  USING (((auth_user_id = auth.uid()) OR (email = (auth.jwt() ->> 'email'::text)) OR ((practice_id = get_my_practice_id()) AND (EXISTS ( SELECT 1
   FROM tc_users tc_users_1
  WHERE ((tc_users_1.auth_user_id = auth.uid()) AND (tc_users_1.role = 'admin'::text))))) OR is_superadmin()));

-- ── Grants (as in production: Supabase's defaults, all tables to the three API roles) ──
GRANT ALL ON public.feedback, public.patients, public.practice_goals, public.practice_metrics,
  public.practices, public.settings, public.tc_users TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.practice_goals_id_seq, public.practice_metrics_id_seq TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tc_email(text), public.get_my_location_scope(), public.get_my_practice_id(),
  public.is_superadmin(), public.guard_tc_users_update() TO anon, authenticated, service_role;
