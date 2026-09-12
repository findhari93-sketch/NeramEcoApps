-- ============================================
-- NEXUS TEST RUN CREDITS (a teacher counts an attempt made through another door)
--
-- One paper is often a Study Materials chapter test and a one-shot exam at the
-- same time. A student who did the paper well through the practice door, but
-- outside the exam window, has done the work and still has no sitting on the
-- exam. Until this table the only honest options were to chase them to sit it
-- again, or to excuse them and lose the score.
--
-- One row per student per run. attempt_id is the attempt the teacher chose to
-- count. It must be on the same paper and by the same student; the API checks
-- that, because a CHECK constraint cannot look across tables.
--
-- Read by packages/database/src/queries/nexus/run-sittings.ts as rule 3, after
-- the run's own door and after an attempt made inside the run's window.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_test_run_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES nexus_test_placements(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id   UUID NOT NULL REFERENCES nexus_test_attempts(id) ON DELETE CASCADE,
  note         TEXT,
  credited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  credited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_test_run_credits_student
  ON nexus_test_run_credits(student_id);

ALTER TABLE nexus_test_run_credits ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
