-- Persist the "why were no add-ons sold?" reason as a first-class patient field.
--
-- The TC has always been forced to type a reason before saving a start with neither
-- whitening (W+) nor retainers (R+), but that text only ever landed inside a
-- contact_log recap string. The Add-On Attach Rate KPI drills into the starts that
-- attached nothing, so the reason needs to be queryable on the patient row itself.
--
-- Empty string means "no reason recorded" — either the start has add-ons (nothing to
-- explain) or it predates this column.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS addon_skip_reason TEXT DEFAULT '';
