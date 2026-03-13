-- Add extra columns to rank_list_entries for complete TNEA rank list data
-- These columns capture candidate-level details from official rank list PDFs
-- (application_number, candidate_name, date_of_birth)

ALTER TABLE rank_list_entries
  ADD COLUMN IF NOT EXISTS application_number TEXT,
  ADD COLUMN IF NOT EXISTS candidate_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth TEXT;

-- Index on application_number for lookups
CREATE INDEX IF NOT EXISTS idx_rank_entries_application_number
  ON rank_list_entries(application_number)
  WHERE application_number IS NOT NULL;
