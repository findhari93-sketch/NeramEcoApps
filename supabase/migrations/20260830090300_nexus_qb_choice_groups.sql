-- Either/or questions: "attempt any one of Q91 or Q92".
--
-- Nothing like this exists anywhere in the schema today; a paper is a flat,
-- fully-required list. This is authoring and display only. Scoring is
-- untouched: finaliseExamScore and recomputeExamAttemptScore
-- (packages/database/src/queries/nexus/exam-drawings.ts) keep summing every
-- question, so an either/or pair is still marked as if both are required
-- until a later migration teaches scoring about the group. Do not assume
-- that support exists because the columns do.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS choice_group_id UUID,
  ADD COLUMN IF NOT EXISTS choice_group_pick SMALLINT;

COMMENT ON COLUMN nexus_qb_questions.choice_group_id IS
  'Questions sharing this value are alternatives on the same paper, e.g. "attempt any one of Q91, Q92". NULL for a question with no alternatives. Display only: finaliseExamScore and recomputeExamAttemptScore do not read this column and still require every question.';
COMMENT ON COLUMN nexus_qb_questions.choice_group_pick IS
  'How many of the choice group a student must attempt. Denormalised onto every member of the group so any one row is enough to render "attempt any N of...". Defaults to 1. Meaningless when choice_group_id is NULL.';

ALTER TABLE nexus_qb_questions
  ALTER COLUMN choice_group_pick SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_choice_group
  ON nexus_qb_questions(choice_group_id)
  WHERE choice_group_id IS NOT NULL;
