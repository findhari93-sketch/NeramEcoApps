-- Drawings sat inside an exam reach the review queue teachers already use.
--
-- No new queue, no new review UI, no second marks scale. drawing_submissions
-- already carries tutor_marks, tutor_feedback, a reviewed image and a status,
-- and /teacher/drawing-reviews already works. An exam drawing is one more
-- source_type.
--
-- REJECTED ALTERNATIVE: minting a backing drawing_questions row per prompt, the
-- way assignments do. It would pollute the practice bank with a copy of every
-- exam prompt and duplicate the prompt text.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drawing_submissions_source_type_check') THEN
    ALTER TABLE drawing_submissions DROP CONSTRAINT drawing_submissions_source_type_check;
  END IF;
END $$;

ALTER TABLE drawing_submissions
  ADD CONSTRAINT drawing_submissions_source_type_check
  CHECK (source_type IN ('question_bank', 'homework', 'free_practice', 'assignment', 'exam'));

ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS exam_attempt_id     UUID REFERENCES nexus_test_attempts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exam_qb_question_id UUID REFERENCES nexus_qb_questions(id)  ON DELETE SET NULL;

COMMENT ON COLUMN drawing_submissions.exam_attempt_id IS
  'The exam attempt this drawing was submitted in. Set only for source_type = exam. Marking one of these recomputes the attempt final_score.';

-- Makes "create one submission per drawing answer" idempotent.
--
-- A double submit, a retried side effect or a re-run of the close sweep must
-- not put the same drawing in the queue twice: a teacher marking it once and
-- seeing it again is how a queue stops being trusted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_exam_attempt_question
  ON drawing_submissions(exam_attempt_id, exam_qb_question_id)
  WHERE exam_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ds_exam_attempt
  ON drawing_submissions(exam_attempt_id)
  WHERE exam_attempt_id IS NOT NULL;
