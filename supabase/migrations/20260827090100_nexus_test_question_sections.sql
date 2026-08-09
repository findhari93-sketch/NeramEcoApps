-- A test remembers which section each of its questions came from.
--
-- WHY SNAPSHOT RATHER THAN JOIN BACK TO THE BANK
-- Three reasons, in order of how much they would hurt:
--   1. marks and negative_marks are ALREADY snapshotted on this table. If the
--      section were derived at read time, a teacher correcting a section in the
--      paper workspace after an exam had been sat would relabel a paper whose
--      marking is frozen, and the two would disagree about what was worth what.
--   2. A test can be composed from several papers, or from the bank, or from
--      AI. Deriving would add a per-question join to the player, the results
--      panel and the Teams renderer, all of them hot paths.
--   3. The sectioned draw has to be reproducible from nexus_test_draws.question_ids
--      alone. Bank edits after a draw must not regroup a paper someone is
--      halfway through sitting.

ALTER TABLE nexus_test_questions
  ADD COLUMN IF NOT EXISTS section       TEXT,
  ADD COLUMN IF NOT EXISTS section_order SMALLINT;

COMMENT ON COLUMN nexus_test_questions.section IS
  'The section this question sat in when the test was composed. Snapshotted from nexus_qb_questions.section, never joined back, so correcting the bank later cannot relabel a paper that has already been marked.';

-- Shuffle WITHIN sections, keeping sections in their paper order.
--
-- Deliberately a NEW flag rather than a reuse of shuffle_questions. composeTest
-- now defaults a section onto every question it stores, so reusing the old flag
-- would silently convert every existing shuffled test from an ephemeral flat
-- shuffle into a persisted sectioned draw. One new boolean, defaulting false,
-- keeps every existing row behaving exactly as it does today.
ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS shuffle_sections BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN nexus_tests.shuffle_sections IS
  'When true the served order is drawn per student by pickSectionedDraw: questions shuffle within their section, sections stay in section_order. Independent of shuffle_questions, which is the older flat shuffle.';

CREATE INDEX IF NOT EXISTS idx_test_questions_section
  ON nexus_test_questions(test_id, section_order, sort_order);

-- Backfill from the bank for everything composed before sections existed.
UPDATE nexus_test_questions tq
SET section = q.section,
    section_order = q.section_order
FROM nexus_qb_questions q
WHERE tq.qb_question_id = q.id
  AND tq.section IS NULL
  AND q.section IS NOT NULL;
