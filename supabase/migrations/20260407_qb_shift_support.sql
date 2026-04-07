-- Add shift column (forenoon/afternoon) to question bank papers and sources
-- Some exam sessions have two separate papers: one for forenoon and one for afternoon

-- 1. Add shift column to original_papers
ALTER TABLE nexus_qb_original_papers
  ADD COLUMN IF NOT EXISTS shift TEXT
    CHECK (shift IS NULL OR shift IN ('forenoon', 'afternoon'));

-- 2. Add shift column to question_sources
ALTER TABLE nexus_qb_question_sources
  ADD COLUMN IF NOT EXISTS shift TEXT
    CHECK (shift IS NULL OR shift IN ('forenoon', 'afternoon'));

-- 3. Drop old unique constraints and recreate with shift
-- Use COALESCE to handle NULLs properly (PostgreSQL treats NULL != NULL in UNIQUE)

ALTER TABLE nexus_qb_original_papers
  DROP CONSTRAINT IF EXISTS nexus_qb_original_papers_exam_type_year_session_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_qb_papers_exam_year_session_shift
  ON nexus_qb_original_papers (exam_type, year, COALESCE(session, ''), COALESCE(shift, ''));

ALTER TABLE nexus_qb_question_sources
  DROP CONSTRAINT IF EXISTS nexus_qb_question_sources_question_id_exam_type_year_session_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_qb_sources_question_exam_year_session_shift
  ON nexus_qb_question_sources (question_id, exam_type, year, COALESCE(session, ''), COALESCE(shift, ''));

-- 4. Index for filtering by shift
CREATE INDEX IF NOT EXISTS idx_nexus_qb_sources_shift
  ON nexus_qb_question_sources(shift) WHERE shift IS NOT NULL;
