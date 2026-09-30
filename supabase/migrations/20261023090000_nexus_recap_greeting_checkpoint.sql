-- ============================================
-- NXS-0130: retire the checkpoint that quizzed a pre-class wait
--
-- "Aptitude: Orthographic Projection and Counting Figures" (recap 8486b2f2)
-- was generated on 2026-08-03, before the generator learned to drop greeting
-- trivia. Its first checkpoint, "Class Opening and Audibility Check", covers
-- 0:00 to 13:06, in which the tutor says "Good evening, students. Good evening,
-- guys. Am I audible?" and nothing else. All 15 of its questions are about
-- those words ("What was the last word spoken by the instructor?"), and a
-- student had to get 7 of 10 right, after sitting through 13 minutes of
-- waiting, before the class itself unlocked.
--
-- The 2026-09-09 cleanup (20260909090300) retired this trivia in the question
-- BANK only (nexus_qb_questions). The checkpoint quiz reads
-- nexus_class_recap_questions, which it never touched, so students kept
-- getting it.
--
-- Every statement is reversible: a checkpoint is archived, not deleted, and a
-- question is deactivated, not deleted. Past attempts keep their rows and their
-- answer review.
-- ============================================

-- 1. Archive the checkpoint. The next one starts at 13:06, and the player lets
--    a student skip the stretch before a checkpoint's start, so the class opens
--    where the teaching does. Archived checkpoints drop out of the unlock order
--    and out of completion (listRecapSectionOrder, markRecapCompletedIfAllPassed
--    and healRecapCompletions all read live sections only). Checked on prod
--    before writing: no student has passed every other checkpoint while owing
--    this one, so archiving it completes nobody by surprise.
UPDATE nexus_class_recap_sections
SET archived_at = now()
WHERE id = 'ecfc3471-4b3f-4aee-a547-20464a7f8d4d'
  AND recap_id = '8486b2f2-077d-4b31-888d-c45ae3d696af'
  AND title = 'Class Opening and Audibility Check'
  AND archived_at IS NULL;

-- 2. Its bank copies, so the class final check stops drawing them. 10 of the 15
--    were retired on 09-09; these are the 5 the old pattern missed. New
--    sittings leave retired bank questions out (ensureTestDraw).
UPDATE nexus_qb_questions
SET is_active = false
WHERE is_active
  AND id IN (
    SELECT tq.qb_question_id
    FROM nexus_test_placements p
    JOIN nexus_test_questions tq ON tq.test_id = p.test_id
    WHERE p.context_type = 'class_recap_section'
      AND p.context_id = 'ecfc3471-4b3f-4aee-a547-20464a7f8d4d'
  );

-- 3. Greeting trivia still live in any other checkpoint. On prod this is two
--    questions in "Class Opening and Chapter Status" (recap 8884aa7a). Matched
--    on question text only, with the 09-09 signature plus the "greetings" and
--    "good morning/afternoon" forms it missed, and guarded so no checkpoint
--    drops below what it serves (or 4): a checkpoint that cannot fill its paper
--    cannot be passed, and everything after it would lock.
WITH live AS (
  SELECT
    q.id,
    q.section_id,
    q.question_text,
    GREATEST(COALESCE(s.questions_to_serve, 0), 4) AS keep_at_least,
    COUNT(*) OVER (PARTITION BY q.section_id) AS total_active
  FROM nexus_class_recap_questions q
  JOIN nexus_class_recap_sections s ON s.id = q.section_id
  WHERE q.is_active
    AND s.archived_at IS NULL
),
trivia AS (
  SELECT
    l.*,
    ROW_NUMBER() OVER (PARTITION BY l.section_id ORDER BY l.id) AS drop_rank
  FROM live l
  WHERE l.question_text ~* '(first word|last word|am i audible|good (morning|afternoon|evening)|\mgreet(ed|ing|ings)?\M|how many times did the (instructor|tutor|teacher))'
)
UPDATE nexus_class_recap_questions
SET is_active = false
WHERE id IN (
  SELECT id FROM trivia WHERE total_active - drop_rank >= keep_at_least
);
