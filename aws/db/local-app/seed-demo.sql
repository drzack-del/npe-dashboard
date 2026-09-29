-- Fake practices, patients and metrics for clicking through the app locally.
-- Every name here is invented. Staff accounts are inserted by start.mjs from demo-users.mjs.
INSERT INTO public.practices(id, name) VALUES
  ('demo-ortho',  'Demo Orthodontics (fake)'),
  ('other-ortho', 'Other Orthodontics (fake)');

INSERT INTO public.settings(practice_id, key, value) VALUES
  ('demo-ortho',  'locations', '["North","South"]'),
  ('other-ortho', 'locations', '["Downtown"]');

-- 40 patients per practice, spread over the last 120 days with a realistic mix of outcomes.
INSERT INTO public.patients(id, name, phone, age, npe_date, location, dp, contract_amount, tc,
  st, sch, pen, obs, notx, pif, obstacle, notes, contact_attempts, practice_id)
SELECT
  p.practice_id || '-p' || lpad(n::text, 3, '0'),
  (ARRAY['Avery','Blake','Casey','Drew','Emery','Finley','Gray','Harper','Jordan','Kai'])[1 + n % 10]
    || ' ' || (ARRAY['Testwell','Samplesen','Fakeman','Mockley','Demoson'])[1 + n % 5] || ' ' || n,
  '555-01' || lpad(n::text, 2, '0'),
  (10 + n % 30)::text,
  to_char(current_date - (n * 3), 'YYYY-MM-DD'),
  p.locations[1 + n % array_length(p.locations, 1)],
  CASE WHEN n % 4 = 0 THEN '500' ELSE '' END,
  CASE WHEN n % 4 IN (0, 1) THEN (4800 + (n % 7) * 150)::text ELSE '' END,
  p.tc,
  n % 4 = 0,            -- started
  n % 4 = 1,            -- scheduled
  n % 4 = 2,            -- pending
  n % 8 = 3,            -- observation
  n % 8 = 7,            -- no treatment
  n % 12 = 0,           -- paid in full
  CASE WHEN n % 4 = 2 THEN (ARRAY['Cost / Budget','Spouse / Partner Needs to Approve','Timing'])[1 + n % 3] ELSE '' END,
  'Fake patient for local testing',
  n % 3,
  p.practice_id
FROM (VALUES
  ('demo-ortho',  ARRAY['North','South'], 'Taylor TC (fake)'),
  ('other-ortho', ARRAY['Downtown'],      'Olive Other Admin (fake)')
) AS p(practice_id, locations, tc)
CROSS JOIN generate_series(1, 40) AS n;

-- Six months of practice metrics and goals for the dashboards.
INSERT INTO public.practice_metrics(year, month, practice_id, net_production, collections,
  npe_scheduled, npe_showed, obs_added, starts, show_up_rate, conversion_rate, avg_case_fee, notes)
SELECT extract(year FROM d)::int, extract(month FROM d)::int, 'demo-ortho',
  180000 + i * 5000, 170000 + i * 4000, 60 + i, 52 + i, 8, 26 + i,
  (52 + i)::numeric / (60 + i), (26 + i)::numeric / (52 + i), 5600, 'Fake metrics'
FROM generate_series(1, 6) AS i,
LATERAL (SELECT date_trunc('month', current_date) - make_interval(months => i) AS d) m;

INSERT INTO public.practice_goals(year, month, practice_id, production_goal, start_goal, npe_goal, conversion_goal, avg_case_fee_goal)
SELECT extract(year FROM d)::int, extract(month FROM d)::int, 'demo-ortho', 200000, 30, 65, 0.55, 5800
FROM generate_series(0, 6) AS i,
LATERAL (SELECT date_trunc('month', current_date) - make_interval(months => i) AS d) m;
