-- ============================================
-- CATCH-UP CLOCK: one deadline at a time, started by the student
--
-- The screen this replaces showed four missed classes, every one of them red,
-- every one "Was due". That is not a bug in the rendering. missedClassDueOn set
-- a missed class's deadline to the day the next class ran, so any class more
-- than a week old is overdue the moment it appears, and a student with a July
-- backlog opening the app in August meets a wall of failure with no way to tell
-- where to begin.
--
-- The model here is a stopwatch instead. Nothing has a deadline until the
-- student starts it; exactly one thing is running at a time; and the window is
-- measured from when they started, not from a date on a calendar they had no
-- say in. A student may start any class out of turn, and the order we suggest
-- becomes a recommendation rather than a lock.
--
-- Two columns and not a stored due_on, for the reason the journey migration
-- gives about its own missing due_on: a stored deadline means a teacher
-- widening the window has to rewrite N rows, and until that rewrite lands the
-- screen and the nudge cron disagree. Deriving it keeps them in step, makes
-- "not started" a single total predicate (activated_on IS NULL) that a partial
-- unique index can enforce, and means every existing row needs no backfill.
--
-- What is deliberately NOT stored:
--   * due_on, days_left, overdue. All three derive from
--     (activated_on, days_used, the classroom's window).
--   * a per-row window snapshot. A teacher widening the window is trying to
--     help students who are struggling NOW, so it should apply at once.
--   * which item is recommended. That derives from kind and class date.
-- ============================================

-- 1. The stopwatch on each item ----------------------------------------------

ALTER TABLE nexus_class_absences
  -- The IST day the clock was last started. NULL means no clock is running,
  -- which is the state every row is in until a student presses Start, and the
  -- state every existing row lands in on deploy day.
  ADD COLUMN IF NOT EXISTS activated_on DATE,

  -- Whole IST days already spent on this class in earlier stints.
  --
  -- This is what stops switching being a reset. A student three days into a
  -- seven day window who starts something else banks 3 here; when they come
  -- back they get the remaining 4, not a fresh 7. Switching away and back on
  -- the same day banks 0 and recomputes the identical deadline, so a double tap
  -- is a no-op rather than a free day.
  ADD COLUMN IF NOT EXISTS days_used INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nexus_class_absences_days_used_check'
  ) THEN
    ALTER TABLE nexus_class_absences
      ADD CONSTRAINT nexus_class_absences_days_used_check CHECK (days_used >= 0);
  END IF;
END $$;

COMMENT ON COLUMN nexus_class_absences.activated_on IS
  'IST day the student started this class. NULL = no clock running. At most one non-NULL per (student, classroom).';
COMMENT ON COLUMN nexus_class_absences.days_used IS
  'Whole days already spent in earlier stints. Banked on switch or completion so re-starting is never a fresh window.';

-- "One clock at a time" as a database fact rather than an application hope.
-- The write path is deactivate-then-activate, but Supabase has no transaction
-- across two statements from the client, so this is the thing that guarantees a
-- half-finished switch cannot leave two deadlines running.
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_absences_one_active
  ON nexus_class_absences(student_id, classroom_id)
  WHERE activated_on IS NOT NULL;

-- The nudge cron's whole working set: every running clock, everywhere. It used
-- to read the full timetable per classroom to work out deadlines.
CREATE INDEX IF NOT EXISTS idx_class_absences_active
  ON nexus_class_absences(activated_on)
  WHERE activated_on IS NOT NULL;

-- 2. The two windows, per classroom ------------------------------------------

ALTER TABLE nexus_classrooms
  -- The standard window: a late joiner catching up syllabus taught before they
  -- existed here, and anyone who genuinely could not attend.
  ADD COLUMN IF NOT EXISTS catchup_window_days INTEGER NOT NULL DEFAULT 7,

  -- The shorter window for a class the student RSVP'd out of. Giving a
  -- deliberate skip the same ten days as someone catching up four months of
  -- backlog reads as unfair to the person who never had the chance, and
  -- kind = 'opted_out' already records the difference.
  ADD COLUMN IF NOT EXISTS catchup_optout_window_days INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nexus_classrooms_catchup_window_days_check'
  ) THEN
    ALTER TABLE nexus_classrooms
      ADD CONSTRAINT nexus_classrooms_catchup_window_days_check
      CHECK (catchup_window_days BETWEEN 1 AND 60);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nexus_classrooms_catchup_optout_window_days_check'
  ) THEN
    ALTER TABLE nexus_classrooms
      ADD CONSTRAINT nexus_classrooms_catchup_optout_window_days_check
      CHECK (catchup_optout_window_days BETWEEN 1 AND 60);
  END IF;
END $$;

COMMENT ON COLUMN nexus_classrooms.catchup_window_days IS
  'Days a student gets once they start a catch-up class. Applies to late_joiner and no_show. Read live, never snapshotted.';
COMMENT ON COLUMN nexus_classrooms.catchup_optout_window_days IS
  'Shorter window for a class the student RSVPd out of (kind = opted_out).';

-- 3. No backfill, on purpose -------------------------------------------------
--
-- Every existing row takes activated_on = NULL and days_used = 0, so on the
-- first read after deploy every open item is "waiting": no deadline, no red, no
-- nudge. Activating each student's oldest item here would start clocks nobody
-- agreed to and put the whole cohort mid-window on day one, which is precisely
-- the failure this migration exists to remove.

NOTIFY pgrst, 'reload schema';
