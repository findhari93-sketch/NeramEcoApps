-- Catch-up class test: derive state from attempts, and clean the transcript trivia.
--
-- WHY (NXS-0141). A student finished the recap, sat the 105 question class test,
-- scored 66.67% against an 85% bar and failed. `recordCatchupTestAttempt` nulled
-- `test_unlocked_at` as the "rewatch before you retry" penalty. Twenty six
-- seconds later a read-time self-heal put it straight back, because its
-- condition (a recap exists, checkpoints complete, nothing unlocked, nothing
-- passed) is exactly the state a fail leaves behind. He returned to a screen
-- identical to the one before he sat it, with no score and no explanation, and
-- reported the class as "completed but still showing incomplete".
--
-- The fix moves the answer out of these one-shot columns and onto
-- nexus_test_attempts, which is already an immutable ledger and is already how a
-- teacher-set class test is read. Nothing here drops a column: test_passed_at
-- and test_unlocked_at keep being written as a denormalised mirror, because
-- teacher and parent surfaces still read them.

-- 1. A reset needs a line in the sand -----------------------------------------
--
-- The teacher action `reset_test` used to work by nulling test_passed_at. With
-- the attempts as the source of truth there is nothing to null: the passing
-- attempt is still on the ledger and always will be. So the reset stamps a
-- timestamp instead, and anything submitted at or before it stops counting.
-- The ledger stays intact, which means a teacher can still see what the student
-- actually did before the reset.
ALTER TABLE nexus_class_absences
  ADD COLUMN IF NOT EXISTS test_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN nexus_class_absences.test_reset_at IS
  'Teacher reset watermark. Attempts submitted at or before this are ignored when deciding whether the catch-up class test is passed. NULL means every attempt counts.';

-- Backfill: an item a teacher had already reset before this column existed
-- (pass wiped, unlock re-opened, never re-passed) must not have its old passing
-- attempt counted the moment attempts become the source of truth. Stamping the
-- reopen time reproduces exactly the state the teacher intended.
UPDATE nexus_class_absences
SET test_reset_at = test_unlocked_at
WHERE test_reset_at IS NULL
  AND test_passed_at IS NULL
  AND test_unlocked_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM nexus_test_placements p
    JOIN nexus_test_attempts a
      ON a.test_id = p.test_id
     AND a.student_id = nexus_class_absences.student_id
    WHERE p.context_type = 'catchup_class'
      AND p.context_id = nexus_class_absences.scheduled_class_id
      AND p.is_active
      AND a.status = 'submitted'
      AND a.mode = 'official'
      AND a.submitted_at < nexus_class_absences.test_unlocked_at
      AND a.percentage >= COALESCE(p.passing_pct, 85)
  );

-- 2. Right-size the papers already live ---------------------------------------
--
-- `collectRecapBankQuestionIds` returns the union of every question the recap's
-- checkpoints own, and nothing capped it. A recap banks 15 per checkpoint and a
-- 97 minute class plans 7, so one student was handed a 105 question paper needing
-- 90 correct. Measured across production: 23 active catch-up tests, 69 questions
-- on average, 22 of them over 40.
--
-- The bank is not touched. Setting questions_to_serve makes `ensureTestDraw`
-- hand out a window of that size per attempt, and `submitAttempt` already grades
-- against the drawn window rather than the pool, so no test is rebuilt, no
-- placement is deactivated, and every past attempt keeps the paper it was
-- actually sat against.
--
-- The window also slides by one paper per attempt, so a 105 question bank gives
-- seven disjoint sittings. That matters because a failed attempt shows the
-- correct answers: without it a retry would be a memory test of the review
-- screen.
UPDATE nexus_tests t
SET questions_to_serve = 15
WHERE t.is_active
  AND t.created_from = 'catchup_class'
  AND t.questions_to_serve IS NULL
  AND (SELECT COUNT(*) FROM nexus_test_questions tq WHERE tq.test_id = t.id) > 15;

-- 3. Retire the transcript trivia ---------------------------------------------
--
-- QUESTION_INSTRUCTION demanded "exactly 15 questions" from every 15 minute
-- segment, and segment 0 of a class is greetings and an audio check. The model
-- did as it was told and produced fifteen questions about the tutor saying
-- "good evening guys, am I audible", including "what was the very first word
-- spoken" and "how many times did the instructor use the phrase Good evening".
-- Those were then folded into the class test and counted toward the 90 correct
-- answers it needed. One student was failed by a single mark on a paper padded
-- with them.
--
-- Deactivated, never deleted: past attempts reference these rows and a deleted
-- question would break the answer review on every one of them.
--
-- Matching on question TEXT, never on section title. Production has sections
-- called "Introduction to Indo-Islamic Architecture" and "Introduction to
-- UNESCO World Heritage Sites" which are real teaching content, so a title
-- filter would take good questions with it. This signature matched 12 rows of
-- 1867 in the recap bank when it was written.
--
-- GUARDED, and the guard is the important part. A checkpoint is passed by
-- answering its questions, and `assertUnlocked` requires every earlier
-- checkpoint to be passed before the next unlocks. Empty a checkpoint's bank and
-- it can never be passed, so the recap becomes permanently uncompletable and the
-- class test behind it never opens: a worse bug than the one being fixed. The
-- CTE therefore keeps at least MIN_KEEP real questions in every checkpoint and
-- only ever removes the surplus, newest first.
WITH sect AS (
  SELECT
    p.context_id AS section_id,
    tq.qb_question_id AS qid,
    tq.sort_order,
    q.is_active,
    q.question_text
  FROM nexus_test_placements p
  JOIN nexus_test_questions tq ON tq.test_id = p.test_id
  JOIN nexus_qb_questions q ON q.id = tq.qb_question_id
  WHERE p.context_type = 'class_recap_section'
),
-- The whole surviving bank of each checkpoint, not just its trivia. Ranking
-- within the trivia alone would happily empty a checkpoint that is ALL trivia.
tot AS (
  SELECT section_id, COUNT(*) FILTER (WHERE is_active) AS total_active
  FROM sect GROUP BY section_id
),
triv AS (
  SELECT
    s.section_id,
    s.qid,
    ROW_NUMBER() OVER (PARTITION BY s.section_id ORDER BY s.sort_order DESC) AS drop_rank
  FROM sect s
  WHERE s.is_active
    AND s.question_text ~* '(first word|last word|am i audible|good evening|greet|how many times did the (instructor|tutor|teacher))'
)
UPDATE nexus_qb_questions
SET is_active = false
WHERE id IN (
  SELECT t.qid
  FROM triv t
  JOIN tot ON tot.section_id = t.section_id
  -- 4, not 0: `resolveSectionGate` caps `serve` at the pool size, so a small
  -- bank still works, but a checkpoint down to one or two questions asks the
  -- same ones of everybody forever and stops being a checkpoint.
  WHERE tot.total_active - t.drop_rank >= 4
);
