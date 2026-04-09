-- Add exam_month to question_posts (1=January … 12=December)
ALTER TABLE question_posts
  ADD COLUMN IF NOT EXISTS exam_month SMALLINT
  CHECK (exam_month IS NULL OR exam_month BETWEEN 1 AND 12);

-- Add proposed session fields to question_change_requests
-- (for future owner-proposed session edits via change request flow)
ALTER TABLE question_change_requests
  ADD COLUMN IF NOT EXISTS proposed_exam_year  INT,
  ADD COLUMN IF NOT EXISTS proposed_exam_month SMALLINT
    CHECK (proposed_exam_month IS NULL OR proposed_exam_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS proposed_exam_session TEXT;

COMMENT ON COLUMN question_posts.exam_month IS
  'Month of the exam session (1=Jan, 12=Dec). Auto-set from submission date.';
