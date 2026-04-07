-- ============================================
-- Backfill exam_date from exam_date_id
-- Fixes data gap where onboarding saved exam_date_id
-- but the schedule API reads exam_date (always NULL)
-- ============================================

UPDATE nexus_student_exam_attempts
SET exam_date = (
  SELECT exam_date FROM nexus_exam_dates
  WHERE id = nexus_student_exam_attempts.exam_date_id
)
WHERE exam_date IS NULL AND exam_date_id IS NOT NULL;
