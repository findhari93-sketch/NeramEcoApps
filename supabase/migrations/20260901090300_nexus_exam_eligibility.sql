-- ============================================================================
-- EXAM ELIGIBILITY: WHICH CLASS(ES) A TEST COVERS, AND WHO IT IS MANDATORY FOR
--
-- Nexus already runs a rolling-enrolment "catch-up" model: students join a
-- classroom day by day, not all at once, and nexus_class_absences already
-- tracks whether a student who missed a live class has since caught up on it
-- (test_unlocked_at / test_passed_at / excused_at). What has never existed is
-- a link from a SCHEDULED EXAM back to the class(es) it tests on, so a teacher
-- scheduling a test has had no way to say "only the students who attended or
-- caught up on Tuesday and Thursday's lecture are required to sit this."
--
-- Two small, audited tables close that gap, matching the existing shape of
-- nexus_exam_makeups / nexus_exam_attempt_overrides rather than a JSONB bag on
-- nexus_exams: both of those precedents are dedicated per-(exam, student) or
-- per-(exam, class) grant tables for exactly this reason (see the header
-- comment on nexus_exam_attempt_overrides in 20260901090100), and this feature
-- needs the same batch-readability for a roster screen plus a real FK.
--
-- Everything here is additive:
--   - An exam with no nexus_exam_covered_classes rows behaves exactly as
--     today: nobody is exempt, every enrolled student is expected to sit it.
--   - nexus_exam_makeups.source defaults to 'teacher_grant', so every existing
--     row and every existing caller of grantExamMakeup is untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Which lecture(s) an exam is testing on.
--
-- A join table, not an array column on nexus_exams: it gets a real FK with
-- ON DELETE CASCADE, and supports "which open exams cover this class" with a
-- plain index rather than a GIN index on an array (needed by the Phase 2
-- reconciliation job that watches nexus_class_absences for a student finishing
-- catch-up after an exam window has already closed).
--
-- scheduled_class_id here is a LECTURE, never the exam's own timetable row
-- (nexus_exams.scheduled_class_id, kind = 'exam') -- the query layer enforces
-- kind = 'lecture' on write, since linking a test to another test would be a
-- teacher's mis-click, not a real scenario.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_exam_covered_classes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id            UUID NOT NULL REFERENCES nexus_exams(id) ON DELETE CASCADE,
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, scheduled_class_id)
);

COMMENT ON TABLE nexus_exam_covered_classes IS
  'Which lecture(s) an exam tests on. Empty for an exam = everyone mandatory (todays behaviour, unchanged). Read in bulk by loadExamEligibilityFacts(), never one row at a time.';

CREATE INDEX IF NOT EXISTS idx_exam_covered_classes_exam  ON nexus_exam_covered_classes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_covered_classes_class ON nexus_exam_covered_classes(scheduled_class_id);

ALTER TABLE nexus_exam_covered_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON nexus_exam_covered_classes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Teacher force-mandatory / force-excuse, per student, per exam.
--
-- Deliberately separate from nexus_exam_makeups: a makeup is a WINDOW (when a
-- student may sit it), an override is a CLASSIFICATION (whether the exam is
-- required for them at all). The two are orthogonal -- a teacher can force a
-- student mandatory and still grant them a makeup window for being genuinely
-- sick on the day, or force-excuse a student with no window involved at all.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_exam_eligibility_overrides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    UUID NOT NULL REFERENCES nexus_exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  override   TEXT NOT NULL CHECK (override IN ('mandatory', 'excused')),
  note       TEXT,
  set_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

COMMENT ON TABLE nexus_exam_eligibility_overrides IS
  'A teacher-set classification that always wins the final bucket a student is shown in, regardless of what the automatic attendance/catch-up computation decided. The underlying auto_bucket is still computed and shown alongside it, never hidden.';

CREATE INDEX IF NOT EXISTS idx_exam_eligibility_overrides_exam ON nexus_exam_eligibility_overrides(exam_id);

ALTER TABLE nexus_exam_eligibility_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON nexus_exam_eligibility_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Where a makeup grant came from.
--
-- 'teacher_grant' (the default, and what every pre-existing row is): a staff
-- member opened this window via POST /api/exams/[examId]/makeup.
-- 'self_serve_new_joiner': the student picked their own reschedule date
-- because they enrolled after the exam's covered class(es) -- no teacher
-- review required for this bucket, confirmed as a deliberate product decision
-- (a student who was never expected to be ready needs no one's permission to
-- say when they will be).
-- ----------------------------------------------------------------------------
ALTER TABLE nexus_exam_makeups
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'teacher_grant';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_exam_makeups_source_check'
      AND conrelid = 'nexus_exam_makeups'::regclass
  ) THEN
    ALTER TABLE nexus_exam_makeups
      ADD CONSTRAINT nexus_exam_makeups_source_check CHECK (source IN ('teacher_grant', 'self_serve_new_joiner'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_exam_makeups.source IS
  'teacher_grant (default, every pre-existing row): a staff member opened this window from the invigilation roster. self_serve_new_joiner: the student picked their own date because they enrolled after the exams covered class(es) -- no teacher approval needed.';

-- PostgREST caches the schema. Without this, the first insert/select against
-- the new tables or column fails until the cache happens to reload.
NOTIFY pgrst, 'reload schema';
