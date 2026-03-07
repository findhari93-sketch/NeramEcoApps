-- Add extra columns to allotment_list_entries for complete TNEA allotment data
-- These columns capture student-level details from official allotment PDFs

ALTER TABLE allotment_list_entries
  ADD COLUMN IF NOT EXISTS application_number text,
  ADD COLUMN IF NOT EXISTS candidate_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth text,
  ADD COLUMN IF NOT EXISTS college_name text,
  ADD COLUMN IF NOT EXISTS branch_name text;

-- Make rank and aggregate_mark nullable (allotment lists may not always have these)
ALTER TABLE allotment_list_entries
  ALTER COLUMN rank DROP NOT NULL,
  ALTER COLUMN aggregate_mark DROP NOT NULL;

-- Index on application_number for lookups
CREATE INDEX IF NOT EXISTS idx_allotment_application_number
  ON allotment_list_entries(application_number)
  WHERE application_number IS NOT NULL;
