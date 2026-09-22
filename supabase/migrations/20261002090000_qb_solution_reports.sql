-- Student reports say WHICH part of a question is wrong.
--
-- nexus_qb_question_reports has existed since March with one flat list of
-- reasons ("wrong answer", "question has error"). That cannot say whether the
-- video, the written solution, the solution image or the answer key is wrong,
-- and those are four different fixes. The three reports on production were
-- never seen by anyone.
--
-- Additive only: new nullable columns, a backfilled target, and a wider
-- report_type list that keeps every old value. No row is rewritten except to
-- give it a target.

ALTER TABLE nexus_qb_question_reports
  ADD COLUMN IF NOT EXISTS target TEXT,
  ADD COLUMN IF NOT EXISTS part_label TEXT,
  ADD COLUMN IF NOT EXISTS solution_ref TEXT,
  ADD COLUMN IF NOT EXISTS video_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS test_id UUID,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- The old reasons each belong to one part of the question.
UPDATE nexus_qb_question_reports
SET target = CASE
  WHEN report_type IN ('wrong_answer', 'no_correct_option') THEN 'answer_key'
  WHEN report_type = 'missing_solution' THEN 'explanation'
  ELSE 'question'
END
WHERE target IS NULL;

ALTER TABLE nexus_qb_question_reports
  ALTER COLUMN target SET DEFAULT 'question',
  ALTER COLUMN target SET NOT NULL;

ALTER TABLE nexus_qb_question_reports
  DROP CONSTRAINT IF EXISTS nexus_qb_question_reports_target_check,
  ADD CONSTRAINT nexus_qb_question_reports_target_check
    CHECK (target IN ('video', 'explanation', 'solution_image', 'answer_key', 'question'));

ALTER TABLE nexus_qb_question_reports
  DROP CONSTRAINT IF EXISTS nexus_qb_question_reports_source_check,
  ADD CONSTRAINT nexus_qb_question_reports_source_check
    CHECK (source IS NULL OR source IN ('practice', 'test_review', 'drawing'));

ALTER TABLE nexus_qb_question_reports
  DROP CONSTRAINT IF EXISTS nexus_qb_question_reports_video_seconds_check,
  ADD CONSTRAINT nexus_qb_question_reports_video_seconds_check
    CHECK (video_seconds IS NULL OR video_seconds >= 0);

-- Every old value stays valid; the new ones name what is wrong with a solution.
ALTER TABLE nexus_qb_question_reports
  DROP CONSTRAINT IF EXISTS nexus_qb_question_reports_report_type_check,
  ADD CONSTRAINT nexus_qb_question_reports_report_type_check
    CHECK (report_type IN (
      'wrong_answer', 'no_correct_option', 'question_error',
      'missing_solution', 'unclear_question', 'other',
      'multiple_correct', 'figure_problem',
      'wrong_working', 'wrong_final_answer', 'different_question',
      'not_loading', 'unclear_solution'
    ));

-- The paper workspace, the badge and the student warning all read open reports
-- by question; the report route counts a student's reports in the last day.
CREATE INDEX IF NOT EXISTS idx_qb_reports_open_question
  ON nexus_qb_question_reports (question_id)
  WHERE status IN ('open', 'in_review');

CREATE INDEX IF NOT EXISTS idx_qb_reports_student_created
  ON nexus_qb_question_reports (student_id, created_at);

NOTIFY pgrst, 'reload schema';
