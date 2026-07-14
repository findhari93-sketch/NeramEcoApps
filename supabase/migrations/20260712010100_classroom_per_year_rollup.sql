-- ============================================================================
-- One-time rollup: split the shared classroom into per-year cohorts
-- ============================================================================
-- Strategy = "keep the current batch in place":
--   * The existing single shared (type='common') classroom BECOMES the current
--     academic-year classroom. Its students and Microsoft Team are untouched.
--   * The previous cohort's classes (dated before the current batch's start date)
--     are moved OUT into a NEW archived classroom (read-only, staff-browsable).
--
-- This fixes the leak where a newly enrolled current-batch student saw last
-- year's graduated-cohort classes on the dashboard/timetable.
--
-- Idempotent + environment-agnostic: codes, the boundary date, and classroom ids
-- are resolved from the data (academic_batches.is_current / start_date), so the
-- same file runs safely on staging and prod. Run AFTER 20260712010000_classroom_per_year.sql.
--
-- Intentionally NOT moved:
--   * nexus_attendance links by scheduled_class_id (no classroom_id), so it
--     follows the moved classes automatically.
--   * Teaching/course plans (nexus_teaching_plans / nexus_course_plans) are
--     teacher-facing, reusable, and not a student-facing leak, so they stay with
--     the current classroom; teachers can archive/rebuild them for the new year.
--   * Curriculum tables (nexus_topics / nexus_checklist_items / *_progress) are
--     left in place; in the target environments the shared classroom has none.
-- ============================================================================

DO $$
DECLARE
  common_id UUID;
  archive_id UUID;
  cur_code   TEXT;
  cur_start  DATE;
  prev_code  TEXT;
  moved      INT := 0;
BEGIN
  -- Current exam-year cohort + its start boundary.
  SELECT code, start_date INTO cur_code, cur_start
    FROM academic_batches
   WHERE is_current = true
   LIMIT 1;

  IF cur_code IS NULL THEN
    RAISE NOTICE 'classroom_per_year_rollup: no current batch found; skipping.';
    RETURN;
  END IF;
  IF cur_start IS NULL THEN
    RAISE NOTICE 'classroom_per_year_rollup: current batch % has no start_date; skipping class move.', cur_code;
  END IF;

  -- Previous cohort = the batch immediately before the current one (its classes
  -- are the ones being archived).
  SELECT code INTO prev_code
    FROM academic_batches
   WHERE start_date < COALESCE(cur_start, start_date)
     AND code <> cur_code
   ORDER BY start_date DESC
   LIMIT 1;

  IF prev_code IS NULL THEN
    -- Fallback so the archive classroom always has a valid code.
    prev_code := to_char((COALESCE(cur_start, CURRENT_DATE) - INTERVAL '1 year'), 'YYYY')
                 || '-' || to_char((COALESCE(cur_start, CURRENT_DATE)), 'YY');
  END IF;

  -- The existing shared classroom becomes the CURRENT-year classroom.
  SELECT id INTO common_id
    FROM nexus_classrooms
   WHERE type = 'common' AND is_archived = false AND is_active = true
   ORDER BY created_at ASC
   LIMIT 1;

  IF common_id IS NULL THEN
    RAISE NOTICE 'classroom_per_year_rollup: no active common classroom found; skipping.';
    RETURN;
  END IF;

  UPDATE nexus_classrooms
     SET academic_year = cur_code, is_archived = false, updated_at = now()
   WHERE id = common_id;

  -- Create (or reuse) the archive classroom for the previous cohort.
  SELECT id INTO archive_id
    FROM nexus_classrooms
   WHERE academic_year = prev_code AND is_archived = true
   ORDER BY created_at ASC
   LIMIT 1;

  IF archive_id IS NULL THEN
    INSERT INTO nexus_classrooms (name, type, description, academic_year, is_archived, is_active)
    VALUES ('Neram ' || prev_code || ' (Archived)', 'common',
            'Archived cohort ' || prev_code || ', read-only', prev_code, true, true)
    RETURNING id INTO archive_id;
  END IF;

  -- Move the previous cohort's classes (dated before the current start) into the
  -- archive. If cur_start is null we cannot bucket by date, so nothing is moved.
  IF cur_start IS NOT NULL THEN
    UPDATE nexus_scheduled_classes
       SET classroom_id = archive_id
     WHERE classroom_id = common_id
       AND scheduled_date < cur_start;
    GET DIAGNOSTICS moved = ROW_COUNT;
  END IF;

  RAISE NOTICE 'classroom_per_year_rollup: current=% (classroom %), archive % (classroom %), moved % classes.',
    cur_code, common_id, prev_code, archive_id, moved;
END $$;
