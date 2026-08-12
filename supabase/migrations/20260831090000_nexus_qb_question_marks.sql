-- Per-question marks, so a paper that does not follow the published scheme can
-- say so.
--
-- Until now marking existed only as a hardcoded table in
-- packages/database/src/queries/nexus/paper-marking.ts (JEE 4/-1, NATA 3/0),
-- applied at test-composition time and snapshotted onto nexus_test_questions.
-- The bulk-upload JSON has always declared marks_correct and marks_negative,
-- the AI prompt has always asked for them and the review screen has always let
-- a teacher edit them, but bulkCreateDraftQuestions never wrote them anywhere.
-- Every value a teacher typed was discarded on import.
--
-- Both columns are nullable on purpose. NULL means "no one has stated the
-- marking for this question", and marksForQuestions falls back to the scheme
-- exactly as it does today, so every existing paper keeps scoring identically.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS marks_correct NUMERIC,
  ADD COLUMN IF NOT EXISTS marks_negative NUMERIC;

COMMENT ON COLUMN nexus_qb_questions.marks_correct IS
  'Marks awarded for a correct answer on this specific question. NULL means fall back to the published scheme in paper-marking.ts. Read by marksForQuestions at test-composition time, never by scoring directly: nexus_test_questions.marks is still the snapshot a test is graded against.';
COMMENT ON COLUMN nexus_qb_questions.marks_negative IS
  'Marks deducted for a wrong answer, stored positive. NULL means fall back to the published scheme. Stored positive because composeTest normalises with Math.abs and a sign here would be applied twice.';
