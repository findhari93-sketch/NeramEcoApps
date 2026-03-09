-- Migration: Seat-Aware College Predictor
-- Adds COA institution mapping to counseling_college_directory
-- and creates RPC for efficient seat occupancy aggregation

-- Step 1: Add COA institution code mapping to counseling_college_directory
ALTER TABLE counseling_college_directory
  ADD COLUMN IF NOT EXISTS coa_institution_code TEXT;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ccd_coa_code
  ON counseling_college_directory(coa_institution_code)
  WHERE coa_institution_code IS NOT NULL;

-- Step 2: RPC to aggregate seat occupancy per college from allotment data
-- This avoids pulling thousands of rows to the application layer
CREATE OR REPLACE FUNCTION get_college_seat_occupancy(
  p_system_id UUID,
  p_year INTEGER,
  p_max_rank INTEGER DEFAULT NULL
)
RETURNS TABLE (
  college_code TEXT,
  branch_code TEXT,
  allotted_category TEXT,
  seats_filled BIGINT,
  min_rank INTEGER,
  max_rank INTEGER,
  min_score NUMERIC,
  max_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ale.college_code,
    ale.branch_code,
    ale.allotted_category,
    COUNT(*)::BIGINT AS seats_filled,
    MIN(ale.rank)::INTEGER AS min_rank,
    MAX(ale.rank)::INTEGER AS max_rank,
    MIN(ale.aggregate_mark) AS min_score,
    MAX(ale.aggregate_mark) AS max_score
  FROM allotment_list_entries ale
  WHERE ale.counseling_system_id = p_system_id
    AND ale.year = p_year
    AND (p_max_rank IS NULL OR ale.rank <= p_max_rank)
  GROUP BY ale.college_code, ale.branch_code, ale.allotted_category
  ORDER BY ale.college_code, ale.branch_code, ale.allotted_category;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 3: RPC to get total seat occupancy per college (all categories combined)
CREATE OR REPLACE FUNCTION get_college_total_occupancy(
  p_system_id UUID,
  p_year INTEGER
)
RETURNS TABLE (
  college_code TEXT,
  total_allotted BIGINT,
  min_rank INTEGER,
  max_rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ale.college_code,
    COUNT(*)::BIGINT AS total_allotted,
    MIN(ale.rank)::INTEGER AS min_rank,
    MAX(ale.rank)::INTEGER AS max_rank
  FROM allotment_list_entries ale
  WHERE ale.counseling_system_id = p_system_id
    AND ale.year = p_year
  GROUP BY ale.college_code
  ORDER BY ale.college_code;
END;
$$ LANGUAGE plpgsql STABLE;
