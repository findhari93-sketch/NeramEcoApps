-- ============================================================================
-- TEST RUNS: WHICH CLASSES A CLASS TEST COVERS, AND WHO MAY SIT IT WHEN
--
-- A paper (nexus_tests) is a reusable asset. One scheduled USE of it is a RUN:
-- a nexus_test_placements row that says who it is for, when it closes, and how
-- they did. The same 150-question paper is routinely both an always-open
-- practice pool and a dated class test, and until now the two were
-- indistinguishable on every teacher screen.
--
-- Exams already have all of this (nexus_exam_covered_classes,
-- nexus_exam_eligibility_overrides, nexus_exam_makeups). Class tests have none
-- of it, which is why the richer roster only ever appeared behind the button
-- labelled "Schedule as exam". These three tables give a class test run the
-- same capabilities, keyed on the PLACEMENT because that is what a class test
-- run IS, where an exam run is a nexus_exams row.
--
-- Why not generalise nexus_exam_makeups instead: its exam_id is
-- NOT NULL REFERENCES nexus_exams(id). Making it polymorphic means dropping a
-- real FK on a table three live exam surfaces read (listExamMakeups,
-- buildExamRoster, the attempt route's exam branch). That is a destructive
-- change to working plumbing to save one table.
--
-- Everything here is additive. A class test with no rows in any of these
-- behaves exactly as it does today: soft deadline, everyone enrolled expected.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Which lecture(s) a class test run covers.
--
-- Mirrors nexus_exam_covered_classes deliberately: same join-table shape, same
-- cascade, same batch readability. It cannot be N placements instead, because
-- uq_placement_single_test (20260823090100) already allows only ONE active
-- class_test placement per class.
--
-- The host class (the placement's own context_id) is written here as a row too,
-- so every reader has ONE list to consult and never has to union it with the
-- placement. The backfill at the bottom does that for existing runs.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_test_run_covered_classes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id       UUID NOT NULL REFERENCES nexus_test_placements(id) ON DELETE CASCADE,
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, scheduled_class_id)
);

COMMENT ON TABLE nexus_test_run_covered_classes IS
  'Which lecture(s) a test run covers. Empty for a run = everyone enrolled is mandatory (the behaviour before this table existed). Includes the host class as a row.';

CREATE INDEX IF NOT EXISTS idx_run_covered_placement ON nexus_test_run_covered_classes(placement_id);
CREATE INDEX IF NOT EXISTS idx_run_covered_class     ON nexus_test_run_covered_classes(scheduled_class_id);

ALTER TABLE nexus_test_run_covered_classes ENABLE ROW LEVEL SECURITY;
-- Idempotent: CREATE POLICY has no IF NOT EXISTS, so without the drop this
-- migration can only ever run once and a re-push fails on "policy already exists".
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_test_run_covered_classes;
CREATE POLICY "service_role_full_access" ON nexus_test_run_covered_classes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Teacher force-mandatory / force-excuse, per student, per run.
--
-- Same split as nexus_exam_eligibility_overrides, for the same reason: a window
-- is WHEN a student may sit it, an override is WHETHER it is required of them
-- at all. The two are orthogonal.
--
-- This is also the escape hatch for a rule the shared eligibility engine gets
-- deliberately wrong for class tests: decideAutoBucket treats an absence's
-- excused_at as "caught up", so a student whose absence a teacher excused is
-- still counted as owing the test. Forking the engine would change exam
-- behaviour too, so the teacher overrides that student here instead.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_test_run_eligibility_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES nexus_test_placements(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  override     TEXT NOT NULL CHECK (override IN ('mandatory', 'excused')),
  note         TEXT,
  set_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_run_overrides_placement ON nexus_test_run_eligibility_overrides(placement_id);

ALTER TABLE nexus_test_run_eligibility_overrides ENABLE ROW LEVEL SECURITY;
-- Idempotent: CREATE POLICY has no IF NOT EXISTS, so without the drop this
-- migration can only ever run once and a re-push fails on "policy already exists".
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_test_run_eligibility_overrides;
CREATE POLICY "service_role_full_access" ON nexus_test_run_eligibility_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- May this student sit it outside the run's shared window?
--
-- One table for the whole story: the student's ask, the teacher's answer, and
-- the window that results. Three sources rather than three tables, because they
-- share one lifecycle and answer one question the attempt route asks on every
-- open: "does this student have a live window right now". Split across three
-- tables, that route would consult three places to answer it once.
--
--   teacher_grant   the teacher opened it for someone, unprompted
--   catchup_auto    the student finished catch-up on a missed class, so the
--                   buffer opens by itself with nobody asked
--   student_request the student asked to be let back in
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_test_access_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id  UUID NOT NULL REFERENCES nexus_test_placements(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('teacher_grant', 'catchup_auto', 'student_request')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'granted', 'declined', 'revoked')),
  -- NULL opens_at means "from now"; NULL closes_at means "until the teacher
  -- closes it". Both nullable so a teacher can open a door indefinitely.
  opens_at      TIMESTAMPTZ,
  closes_at     TIMESTAMPTZ,
  student_note  TEXT,
  decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_window_ordered
    CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

COMMENT ON TABLE nexus_test_access_requests IS
  'Per-student access to a test run outside its shared window: a teacher grant, an automatic catch-up buffer, or a student request awaiting a decision.';

-- At most one LIVE row per (placement, student). PARTIAL on purpose: a declined
-- or revoked row is history and must not stop the student asking again. This is
-- the same trap uq_placement_test_context fell into by having no predicate at
-- all, spelled out here so it is not repeated a third time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_access_live
  ON nexus_test_access_requests (placement_id, student_id)
  WHERE status IN ('pending', 'granted');

CREATE INDEX IF NOT EXISTS idx_test_access_placement_status
  ON nexus_test_access_requests (placement_id, status);
CREATE INDEX IF NOT EXISTS idx_test_access_student
  ON nexus_test_access_requests (student_id) WHERE status = 'granted';

ALTER TABLE nexus_test_access_requests ENABLE ROW LEVEL SECURITY;
-- Idempotent: CREATE POLICY has no IF NOT EXISTS, so without the drop this
-- migration can only ever run once and a re-push fails on "policy already exists".
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_test_access_requests;
CREATE POLICY "service_role_full_access" ON nexus_test_access_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Backfill: every existing active class test run covers its own host class.
--
-- Idempotent. This is what makes every run that already exists roster-aware the
-- moment this lands, rather than only newly created ones.
-- ----------------------------------------------------------------------------
INSERT INTO nexus_test_run_covered_classes (placement_id, scheduled_class_id)
SELECT id, context_id
FROM nexus_test_placements
WHERE context_type = 'class_test'
  AND is_active = true
ON CONFLICT DO NOTHING;

-- Existing class test placements keep available_until = NULL, which means "never
-- closes". Their soft behaviour is preserved exactly; only newly created runs
-- opt into a hard close. Deliberately NOT backfilled: silently shutting a door
-- on students who were told it would stay open is the one change here that
-- could not be undone from the teacher's side.

NOTIFY pgrst, 'reload schema';
