-- Started-before-Medicaid-decision tracking.
-- A patient who started treatment before hearing back from Medicaid keeps their
-- START credit (SDS/ST, MP stays false) but still needs the claim tracked in the
-- Medicaid Pipeline. This flag puts such a patient on the pipeline board without
-- flipping them to MP (which would zero out their start via isSDS()).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medicaid_pipeline BOOLEAN DEFAULT FALSE;
