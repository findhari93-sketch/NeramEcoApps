-- Pre-class work: assignments a student is meant to finish BEFORE a class, and
-- the reason they give when they have not.
--
-- The teacher's own framing for why the reason matters more than the deadline:
-- "most of them will give a reason and they will not actually complete it, some
-- will take more time. If the student is not completing before the class, at
-- least they must provide a reason before the class why they haven't completed."
-- So the deadline is not an enforcement mechanism, it is the moment we ask.

-- 1. timing: an explicit discriminator, not an inference from due_at.
--
-- Inferring "prework" from due_at < class start loses three ways: the hottest
-- student query (listAssignmentsForStudent) does not join the class table, so
-- inference would add a join to every page load; due_at is nullable, so a
-- teacher who sets prework without a date could not be represented; and homework
-- set on Monday and due Wednesday genuinely falls before Wednesday's class, so
-- inference would misclassify it and start nagging students about it.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS timing TEXT NOT NULL DEFAULT 'homework';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_assignments_timing_check'
      AND conrelid = 'nexus_class_assignments'::regclass
  ) THEN
    ALTER TABLE nexus_class_assignments
      ADD CONSTRAINT nexus_class_assignments_timing_check
      CHECK (timing IN ('prework', 'homework'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_class_assignments.timing IS
  'prework = due before its class starts; homework = set in the class. Default homework, so every existing row keeps its current meaning and no backfill is needed.';

-- A CHECK rather than an enum so widening it later is the cheap drop and re-add
-- used for nexus_class_absences.kind, not an ALTER TYPE needing its own file.

-- The index the afternoon sweep needs: published prework due in a window.
CREATE INDEX IF NOT EXISTS idx_class_assignments_prework_due
  ON nexus_class_assignments(due_at)
  WHERE timing = 'prework' AND status = 'published';

-- 2. The reason a student gives for not having done their prework.
--
-- Its own table rather than a column on nexus_assignment_submissions: a row there
-- with zero files and status 'submitted' would poison the To do / Done tabs, the
-- engagement rollups and the points award, and a drawing assignment stores its
-- work in drawing_submissions and so could not hold a reason there at all.
-- Not on nexus_class_absences either: that is per class, not per assignment, and
-- it would insert students who ATTENDED into a table six surfaces read as "who
-- missed this class".
CREATE TABLE IF NOT EXISTS nexus_prework_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES nexus_class_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Denormalised for the same reason nexus_class_absences.classroom_id is: the
  -- teacher's "who keeps skipping this in my classroom" read must not have to
  -- join through assignments on every dashboard load.
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  -- Context, SET NULL, matching how the assignment itself holds its class.
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE SET NULL,

  reason_code TEXT NOT NULL
    CHECK (reason_code IN ('not_understood', 'no_time', 'materials', 'unwell', 'other')),
  reason_note TEXT,
  -- "I have started, I just need more time": the state the teacher named. A
  -- boolean rather than a sixth reason code because it is orthogonal to why.
  started BOOLEAN NOT NULL DEFAULT false,
  reason_submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Stored, not derived: due_at moves when the class moves, and an answer given
  -- in time must not become "late" retroactively because of a later reschedule.
  answered_before_class BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_prework_reasons_assignment
  ON nexus_prework_reasons(assignment_id);
CREATE INDEX IF NOT EXISTS idx_prework_reasons_student
  ON nexus_prework_reasons(student_id, reason_submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_prework_reasons_classroom
  ON nexus_prework_reasons(classroom_id, reason_submitted_at DESC);

DROP TRIGGER IF EXISTS nexus_prework_reasons_updated_at ON nexus_prework_reasons;
CREATE TRIGGER nexus_prework_reasons_updated_at
  BEFORE UPDATE ON nexus_prework_reasons
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

ALTER TABLE nexus_prework_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_prework_reasons;
CREATE POLICY "service_role_full_access" ON nexus_prework_reasons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
