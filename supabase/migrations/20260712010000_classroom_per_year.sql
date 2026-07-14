-- ============================================================================
-- Classroom-per-year lifecycle: term-scoped cohorts
-- ============================================================================
-- Enterprise model (Google Classroom / Microsoft Teams for Education): each
-- academic year gets its OWN nexus_classrooms row. A year's classroom holds only
-- that cohort's classes and enrollments. At year end the classroom is ARCHIVED
-- (kept in DB, read-only, hidden from students, browsable by staff) and a new
-- classroom becomes current. This makes classroom_id mean "this year's cohort",
-- so the existing classroom_id scoping on classes/dashboard becomes correct
-- WITHOUT a term column on classes.
--
-- Reverses the single-classroom consolidation (commit 0df5cb4): drops the
-- one-common-classroom guarantee so more than one classroom can exist.
-- The companion data migration (…_classroom_per_year_rollup.sql) untangles the
-- existing shared classroom for the live cohort.
-- ============================================================================

-- 1. Lifecycle columns on nexus_classrooms -----------------------------------
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- academic_year mirrors academic_batches.code (e.g. '2026-27'). Deliberately NO
-- foreign key, same rule as users.academic_year. Added as a separate, idempotent
-- CHECK so re-runs are safe.
ALTER TABLE nexus_classrooms DROP CONSTRAINT IF EXISTS nexus_classrooms_academic_year_check;
ALTER TABLE nexus_classrooms
  ADD CONSTRAINT nexus_classrooms_academic_year_check
  CHECK (academic_year IS NULL OR academic_year ~ '^[0-9]{4}-[0-9]{2}$');

COMMENT ON COLUMN nexus_classrooms.academic_year IS
  'Exam-year cohort this classroom serves (mirrors academic_batches.code, e.g. 2026-27). No FK, same rule as users.academic_year. NULL = legacy/global classroom.';
COMMENT ON COLUMN nexus_classrooms.is_archived IS
  'Year-end lifecycle flag: true = read-only, hidden from students, browsable by staff. Distinct from is_active (hard kill-switch). Archived classrooms keep is_active=true.';

-- 2. Drop the single-common guarantee (blocks a 2nd classroom under per-year) --
DROP INDEX IF EXISTS nexus_classrooms_unique_common;

-- Defensive: the consolidation already dropped this auto-enroll trigger; ensure
-- it stays gone so it cannot double-enroll students across multiple 'common'
-- classrooms once more than one exists.
DROP TRIGGER IF EXISTS trg_auto_enroll_common ON nexus_enrollments;
DROP FUNCTION IF EXISTS auto_enroll_common_classroom();

-- 3. New guarantee: at most ONE non-archived classroom per academic_year -------
CREATE UNIQUE INDEX IF NOT EXISTS nexus_classrooms_unique_active_year
  ON nexus_classrooms (academic_year)
  WHERE is_archived = false AND academic_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_classrooms_academic_year
  ON nexus_classrooms (academic_year);
CREATE INDEX IF NOT EXISTS idx_nexus_classrooms_is_archived
  ON nexus_classrooms (is_archived);
