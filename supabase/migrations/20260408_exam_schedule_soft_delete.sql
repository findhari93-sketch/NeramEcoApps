-- Add soft delete support to nexus_student_exam_attempts
-- Students can remove their exam date record with a reason
-- Teachers/admins can view deleted records

ALTER TABLE nexus_student_exam_attempts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text DEFAULT NULL;

-- Index for efficient filtering of non-deleted records
CREATE INDEX IF NOT EXISTS idx_exam_attempts_deleted_at
  ON nexus_student_exam_attempts (deleted_at)
  WHERE deleted_at IS NULL;
