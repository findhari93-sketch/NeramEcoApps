-- ============================================
-- EXAM SCHEDULE: Add city and session to attempts
-- Enables the Exam Schedule Dashboard to group
-- students by city and session per exam date
-- ============================================

ALTER TABLE nexus_student_exam_attempts
  ADD COLUMN IF NOT EXISTS exam_city TEXT,
  ADD COLUMN IF NOT EXISTS exam_session TEXT CHECK (exam_session IN ('morning', 'afternoon'));

CREATE INDEX IF NOT EXISTS idx_nexus_exam_attempts_city ON nexus_student_exam_attempts(exam_city);
