-- ============================================================
-- QB Bulk Upload: Status lifecycle, NTA IDs, upload tracking
-- ============================================================

-- 1. Add status lifecycle to questions
--    draft -> answer_keyed -> complete -> active
--    Existing questions default to 'active' (already have content)
ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'answer_keyed', 'complete', 'active'));

-- 2. Add NTA question ID for dedup and answer key matching
ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS nta_question_id TEXT;

-- 3. Relax NOT NULL for draft questions
--    Safe: all existing rows already have values
ALTER TABLE nexus_qb_questions ALTER COLUMN correct_answer DROP NOT NULL;
ALTER TABLE nexus_qb_questions ALTER COLUMN explanation_brief DROP NOT NULL;

-- 4. Replace content constraint: only enforce for complete/active
ALTER TABLE nexus_qb_questions DROP CONSTRAINT IF EXISTS question_has_content;
ALTER TABLE nexus_qb_questions ADD CONSTRAINT question_has_content
  CHECK (
    status IN ('draft', 'answer_keyed')
    OR question_text IS NOT NULL
    OR question_image_url IS NOT NULL
  );

-- 5. Active questions must have correct_answer and explanation
ALTER TABLE nexus_qb_questions ADD CONSTRAINT active_question_complete
  CHECK (
    status != 'active'
    OR (correct_answer IS NOT NULL AND explanation_brief IS NOT NULL)
  );

-- 6. Extend original_papers with upload tracking columns
ALTER TABLE nexus_qb_original_papers
  ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'parsed', 'answer_keyed', 'complete')),
  ADD COLUMN IF NOT EXISTS questions_parsed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_answer_keyed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS questions_complete INT DEFAULT 0;

-- 7. Make pdf_url nullable (bulk uploads may not have a PDF)
ALTER TABLE nexus_qb_original_papers ALTER COLUMN pdf_url DROP NOT NULL;

-- 8. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_status
  ON nexus_qb_questions(status);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_nta_id
  ON nexus_qb_questions(nta_question_id) WHERE nta_question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_paper
  ON nexus_qb_questions(original_paper_id) WHERE original_paper_id IS NOT NULL;
