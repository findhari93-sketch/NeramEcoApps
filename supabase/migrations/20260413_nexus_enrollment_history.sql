-- Migration: Student Removal & Historical Students
-- Adds enrollment history audit trail and removal metadata to nexus_enrollments

-- ============================================
-- 1. New notification event types
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'classroom_removed';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'classroom_restored';

-- ============================================
-- 2. Add removal columns to nexus_enrollments
-- ============================================
ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS removal_reason_category TEXT CHECK (removal_reason_category IN (
    'fee_nonpayment', 'course_completed', 'college_admitted',
    'self_withdrawal', 'disciplinary', 'other'
  )),
  ADD COLUMN IF NOT EXISTS removal_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_nexus_enrollments_active
  ON nexus_enrollments(classroom_id, is_active);

-- ============================================
-- 3. Create nexus_enrollment_history table
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_enrollment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES nexus_enrollments(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('enrolled', 'removed', 'restored')),
  reason_category TEXT CHECK (reason_category IN (
    'fee_nonpayment', 'course_completed', 'college_admitted',
    'self_withdrawal', 'disciplinary', 'other'
  )),
  notes TEXT,
  performed_by UUID NOT NULL REFERENCES users(id),
  progress_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_history_enrollment ON nexus_enrollment_history(enrollment_id);
CREATE INDEX idx_enrollment_history_classroom ON nexus_enrollment_history(classroom_id);
CREATE INDEX idx_enrollment_history_user ON nexus_enrollment_history(user_id);
CREATE INDEX idx_enrollment_history_action ON nexus_enrollment_history(action);

-- ============================================
-- 4. RLS Policies
-- ============================================
ALTER TABLE nexus_enrollment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_enrollment_history"
  ON nexus_enrollment_history FOR ALL TO service_role USING (true) WITH CHECK (true);
