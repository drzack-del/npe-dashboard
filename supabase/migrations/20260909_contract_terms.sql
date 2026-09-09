-- Financing term vs. treatment length.
--
-- Two integers per patient so the dashboard can answer one question: when we
-- finance, how many months do we finance for compared to how long treatment
-- actually runs. See docs/contract-terms-plan.md.
--
-- Nullable on purpose. NULL means "nobody has recorded this yet"; 0 means "no
-- payment plan" (paid in full). A DEFAULT 0 would silently answer ~380 historical
-- starts as paid-in-full and the stat would launch on fiction.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS financed_months  INTEGER DEFAULT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS treatment_months INTEGER DEFAULT NULL;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_financed_months_check;
ALTER TABLE patients ADD CONSTRAINT patients_financed_months_check
  CHECK (financed_months IS NULL OR (financed_months >= 0 AND financed_months <= 120));

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_treatment_months_check;
ALTER TABLE patients ADD CONSTRAINT patients_treatment_months_check
  CHECK (treatment_months IS NULL OR (treatment_months >= 1 AND treatment_months <= 120));

-- Patients already marked Paid In Full have no payment plan, and the app has known
-- that all along. Answer them from existing data rather than asking anyone to retype
-- it — this is what keeps them out of the backfill worklist entirely.
-- Guarded on IS NULL so it can never overwrite a hand-entered term.
UPDATE patients SET financed_months = 0 WHERE pif = true AND financed_months IS NULL;
