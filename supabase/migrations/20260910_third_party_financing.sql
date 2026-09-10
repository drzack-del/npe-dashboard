-- Third-party financing (CareCredit and the like).
--
-- Some patients finance through an outside lender on the lender's terms. The
-- practice never holds that plan, so its length has nothing to do with how long
-- we finance relative to treatment. Flagging it keeps those starts out of the
-- Financed Beyond Treatment cohort and off the Contract Terms backfill list.
--
-- NOT NULL DEFAULT false: every existing start was financed in-house or PIF as
-- far as the app knew, and a NULL here would read as "unknown" nowhere useful.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS third_party_financing BOOLEAN NOT NULL DEFAULT false;
