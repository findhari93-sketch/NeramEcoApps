-- ============================================
-- NEXUS TEST REGRADES (score-change log)
--
-- getComposedTestQuestions reads correct_answer LIVE from nexus_qb_questions at
-- grading time, so correcting a key fixes every future attempt on its own. What
-- it cannot fix is the attempts already submitted: those keep the score, marks
-- and percentage written at submit time. Until now that gap was invisible, and
-- it showed up as a student's review screen disagreeing with the score on their
-- own record, with nothing to explain the difference.
--
-- The re-grade closes the gap, and this table is what makes it accountable. One
-- row per attempt whose score actually moved: what it was, what it became, and
-- who ordered it. A stored score is a student's record, so changing one without
-- a trail is not something this codebase should be able to do.
--
-- Deliberately records only CHANGED attempts. A re-grade that moved nobody
-- writes nothing, so the log stays a list of consequences rather than a list of
-- button presses.
--
-- Note the columns this does NOT touch: final_score / final_total_marks /
-- final_percentage / finalised_at belong to drawing marking
-- (recomputeExamAttemptScore) and are a separate axis that effectiveAttemptScore
-- reconciles. A re-grade writes the objective half only.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_test_regrades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  placement_id   UUID,
  attempt_id     UUID NOT NULL REFERENCES nexus_test_attempts(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_score      NUMERIC(6,2),
  old_total      NUMERIC(6,2),
  old_percentage NUMERIC(5,2),
  new_score      NUMERIC(6,2),
  new_total      NUMERIC(6,2),
  new_percentage NUMERIC(5,2),
  reason         TEXT,
  actor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_test_regrades_test
  ON nexus_test_regrades(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_test_regrades_attempt
  ON nexus_test_regrades(attempt_id);
CREATE INDEX IF NOT EXISTS idx_nexus_test_regrades_student
  ON nexus_test_regrades(student_id, created_at DESC);

ALTER TABLE nexus_test_regrades ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
