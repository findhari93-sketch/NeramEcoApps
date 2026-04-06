-- ============================================
-- EXAM SCHEDULE V2: Store exam_date directly,
-- deactivate old wrong dates
-- ============================================

-- Add exam_date directly to attempts (no FK dependency on nexus_exam_dates)
ALTER TABLE nexus_student_exam_attempts
  ADD COLUMN IF NOT EXISTS exam_date DATE;

-- Deactivate old wrong NATA dates (they were Mondays, not Fri/Sat)
UPDATE nexus_exam_dates SET is_active = false WHERE exam_type = 'nata';
