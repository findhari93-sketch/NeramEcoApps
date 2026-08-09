-- Scheduled exams: a paper, a classroom, a window, and a published result.

-- ---------------------------------------------------------------------------
-- An exam is a timetable item
--
-- Every row in nexus_scheduled_classes has been a lecture until now. An exam is
-- a class with no Teams meeting, which is what lets it inherit the timetable,
-- the class panel, the roster, the reminders and the share card instead of
-- growing a parallel calendar.
--
-- CONSEQUENCE, and it is the largest integration risk in this feature: every
-- existing reader of nexus_scheduled_classes now sees exam rows. Each one has
-- to decide deliberately whether it wants them. See the audit in the same
-- commit as this migration.
-- ---------------------------------------------------------------------------
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'lecture';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_scheduled_classes_kind_check'
      AND conrelid = 'nexus_scheduled_classes'::regclass
  ) THEN
    ALTER TABLE nexus_scheduled_classes
      ADD CONSTRAINT nexus_scheduled_classes_kind_check CHECK (kind IN ('lecture', 'exam'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_scheduled_classes.kind IS
  'lecture (the default, and what every pre-existing row is) or exam. An exam row carries no Teams meeting. Readers that mean "a taught class" must filter kind = ''lecture''.';

CREATE INDEX IF NOT EXISTS idx_scheduled_classes_kind
  ON nexus_scheduled_classes(classroom_id, kind, scheduled_date);

-- ---------------------------------------------------------------------------
-- The exam itself
--
-- Why a table rather than more columns on the scheduled class or more keys in
-- placement.gating:
--   - Publication state has no home. "Which exams have unpublished results"
--     would be a full scan with a JSON parse if it lived in gating.
--   - nexus_scheduled_classes is already ~40 columns and is read on every
--     timetable load. Five exam-only columns there cost every lecture.
--   - Rank has to be snapshotted (see nexus_exam_results), which needs a child
--     table anyway.
--
-- opens_at/closes_at here are THE SOURCE OF TRUTH. The placement window and the
-- scheduled class's date and times are derived mirrors, rewritten only by
-- syncExamWindow(), so the three cannot drift.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_exams (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id   UUID NOT NULL UNIQUE REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  -- Sibling exams created in one press share this, exactly as multi-classroom
  -- lectures share meeting_group_id. It is what makes the cross-classroom
  -- comparison a group-by rather than a guess.
  series_id            UUID NOT NULL DEFAULT gen_random_uuid(),
  classroom_id         UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  test_id              UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE RESTRICT,
  title                TEXT,
  opens_at             TIMESTAMPTZ NOT NULL,
  closes_at            TIMESTAMPTZ NOT NULL,
  duration_minutes     INTEGER,
  passing_pct          NUMERIC(5,2),
  results_state        TEXT NOT NULL DEFAULT 'unpublished'
                         CHECK (results_state IN ('unpublished', 'provisional', 'final')),
  results_published_at TIMESTAMPTZ,
  results_published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  teams_results_message_id TEXT,
  teams_results_posted_at  TIMESTAMPTZ,
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exam_window_ordered CHECK (closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS idx_nexus_exams_series    ON nexus_exams(series_id);
CREATE INDEX IF NOT EXISTS idx_nexus_exams_test      ON nexus_exams(test_id);
CREATE INDEX IF NOT EXISTS idx_nexus_exams_classroom ON nexus_exams(classroom_id, opens_at DESC);

-- A per-student second door, audited: who opened it, when, and why.
CREATE TABLE IF NOT EXISTS nexus_exam_makeups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id    UUID NOT NULL REFERENCES nexus_exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opens_at   TIMESTAMPTZ NOT NULL,
  closes_at  TIMESTAMPTZ NOT NULL,
  reason     TEXT,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (exam_id, student_id),
  CONSTRAINT makeup_window_ordered CHECK (closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS idx_nexus_exam_makeups_student ON nexus_exam_makeups(student_id);

-- The published snapshot.
--
-- rank is FROZEN here on purpose. It is named in a Teams post and in a private
-- message to each student, so a makeup sitting three days later must not
-- silently renumber a podium that has already been announced. Recomputing on
-- read would do exactly that.
CREATE TABLE IF NOT EXISTS nexus_exam_results (
  exam_id        UUID NOT NULL REFERENCES nexus_exams(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id     UUID REFERENCES nexus_test_attempts(id) ON DELETE SET NULL,
  rank           INTEGER,
  score          NUMERIC(6,2),
  total_marks    NUMERIC(6,2),
  percentage     NUMERIC(5,2),
  section_scores JSONB NOT NULL DEFAULT '[]',
  is_provisional BOOLEAN NOT NULL DEFAULT true,
  absent         BOOLEAN NOT NULL DEFAULT false,
  notified_at    TIMESTAMPTZ,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_exam_results_student ON nexus_exam_results(student_id);

-- Service-role only, matching nexus_test_placements. Every read goes through an
-- API route that has already established who the caller is.
ALTER TABLE nexus_exams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_makeups ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_exam_results ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- The final score, alongside the objective one and never over it
--
-- score/percentage on an attempt are read by getTestResults, getStudentTestStats,
-- listStudentAttempts, summariseAttempts and the leaderboard. Overwriting them
-- when a drawing is marked would make a half-marked exam indistinguishable from
-- a real score in all of those at once. So the two-stage result gets its own
-- columns and every exam surface reads through effectiveAttemptScore().
-- ---------------------------------------------------------------------------
ALTER TABLE nexus_test_attempts
  ADD COLUMN IF NOT EXISTS final_score       NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS final_total_marks NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS final_percentage  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS finalised_at      TIMESTAMPTZ;

COMMENT ON COLUMN nexus_test_attempts.finalised_at IS
  'Set once every drawing on this attempt has been marked. Until then final_* are null and effectiveAttemptScore() reports the objective columns as provisional.';
