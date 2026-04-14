-- Migration: Decouple exam data from classrooms
-- Exam data is a student-level fact, not a classroom-level fact.
-- Classrooms determine the roster (who you see), not the data.

-- ============================================================
-- Step 1: Deduplicate exam attempts across classrooms
-- Keep the row with the most data (has exam_date, non-planning state, most recent)
-- ============================================================

WITH ranked_attempts AS (
  SELECT id, student_id, exam_type, phase, attempt_number,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, exam_type, phase, attempt_number
      ORDER BY
        CASE WHEN exam_date IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN state NOT IN ('planning') THEN 0 ELSE 1 END,
        updated_at DESC
    ) AS rn
  FROM nexus_student_exam_attempts
  WHERE deleted_at IS NULL
)
UPDATE nexus_student_exam_attempts
SET deleted_at = now(), deletion_reason = 'dedup_classroom_migration'
WHERE id IN (SELECT id FROM ranked_attempts WHERE rn > 1);

-- Deduplicate exam plans
WITH ranked_plans AS (
  SELECT id, student_id, exam_type,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, exam_type
      ORDER BY
        CASE WHEN state != 'still_thinking' THEN 0 ELSE 1 END,
        CASE WHEN application_number IS NOT NULL THEN 0 ELSE 1 END,
        updated_at DESC
    ) AS rn
  FROM nexus_student_exam_plans
)
DELETE FROM nexus_student_exam_plans
WHERE id IN (SELECT id FROM ranked_plans WHERE rn > 1);

-- Deduplicate exam registrations
WITH ranked_regs AS (
  SELECT id, student_id, exam_type,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, exam_type
      ORDER BY
        CASE WHEN is_writing = true THEN 0 ELSE 1 END,
        CASE WHEN application_number IS NOT NULL THEN 0 ELSE 1 END,
        updated_at DESC
    ) AS rn
  FROM nexus_student_exam_registrations
)
DELETE FROM nexus_student_exam_registrations
WHERE id IN (SELECT id FROM ranked_regs WHERE rn > 1);

-- ============================================================
-- Step 2: Drop old unique constraints that include classroom_id
-- ============================================================

ALTER TABLE nexus_student_exam_attempts
  DROP CONSTRAINT IF EXISTS nexus_student_exam_attempts_student_id_classroom_id_exam_ty_key;

ALTER TABLE nexus_student_exam_plans
  DROP CONSTRAINT IF EXISTS nexus_student_exam_plans_student_id_classroom_id_exam_type_key;

ALTER TABLE nexus_student_exam_registrations
  DROP CONSTRAINT IF EXISTS nexus_student_exam_registrati_student_id_classroom_id_exam__key;

-- ============================================================
-- Step 3: Add new unique constraints WITHOUT classroom_id
-- ============================================================

ALTER TABLE nexus_student_exam_attempts
  ADD CONSTRAINT nexus_student_exam_attempts_student_exam_unique
  UNIQUE (student_id, exam_type, phase, attempt_number);

ALTER TABLE nexus_student_exam_plans
  ADD CONSTRAINT nexus_student_exam_plans_student_exam_unique
  UNIQUE (student_id, exam_type);

ALTER TABLE nexus_student_exam_registrations
  ADD CONSTRAINT nexus_student_exam_registrations_student_exam_unique
  UNIQUE (student_id, exam_type);

-- ============================================================
-- Step 4: Make classroom_id nullable (kept for audit trail)
-- ============================================================

ALTER TABLE nexus_student_exam_attempts
  ALTER COLUMN classroom_id DROP NOT NULL;

ALTER TABLE nexus_student_exam_plans
  ALTER COLUMN classroom_id DROP NOT NULL;

ALTER TABLE nexus_student_exam_registrations
  ALTER COLUMN classroom_id DROP NOT NULL;
