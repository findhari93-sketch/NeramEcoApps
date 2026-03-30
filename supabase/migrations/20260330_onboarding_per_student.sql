-- Migration: Change onboarding from per-classroom to per-student
-- This ensures each student has exactly ONE onboarding record regardless of classrooms.

-- Step 1: Deduplicate existing records.
-- For each student with multiple rows, keep the "best" one:
--   Priority: approved > submitted > rejected > in_progress
--   Tiebreaker: most recently updated
WITH ranked AS (
  SELECT id, student_id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id
      ORDER BY
        CASE status
          WHEN 'approved' THEN 1
          WHEN 'submitted' THEN 2
          WHEN 'rejected' THEN 3
          WHEN 'in_progress' THEN 4
        END,
        updated_at DESC NULLS LAST
    ) AS rn
  FROM nexus_student_onboarding
)
DELETE FROM nexus_student_onboarding
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Drop old unique constraint and redundant index
ALTER TABLE nexus_student_onboarding
  DROP CONSTRAINT nexus_student_onboarding_student_id_classroom_id_key;

DROP INDEX IF EXISTS idx_nexus_onboarding_student;

-- Step 3: Make classroom_id nullable (existing records keep their value)
ALTER TABLE nexus_student_onboarding
  ALTER COLUMN classroom_id DROP NOT NULL;

-- Step 4: Add per-student unique constraint
ALTER TABLE nexus_student_onboarding
  ADD CONSTRAINT nexus_student_onboarding_student_id_key UNIQUE (student_id);

-- Step 5: New index for student-level lookup
CREATE INDEX idx_nexus_onboarding_student ON nexus_student_onboarding(student_id);

-- Step 6: Update RLS policy for teachers.
-- Since classroom_id is no longer the link, check if the student is enrolled
-- in any classroom where the teacher is also enrolled.
DROP POLICY IF EXISTS "teachers_classroom_onboarding" ON nexus_student_onboarding;

CREATE POLICY "teachers_classroom_onboarding" ON nexus_student_onboarding
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments te
      JOIN nexus_enrollments se ON te.classroom_id = se.classroom_id
      WHERE te.user_id = auth.uid()
        AND te.role IN ('teacher', 'admin')
        AND te.is_active = true
        AND se.user_id = nexus_student_onboarding.student_id
        AND se.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments te
      JOIN nexus_enrollments se ON te.classroom_id = se.classroom_id
      WHERE te.user_id = auth.uid()
        AND te.role IN ('teacher', 'admin')
        AND te.is_active = true
        AND se.user_id = nexus_student_onboarding.student_id
        AND se.is_active = true
    )
  );
