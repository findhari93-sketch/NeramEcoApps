-- =============================================================================
-- Nexus Student Onboarding Gate
-- Creates onboarding tracking table, adds Signature template, and
-- adds onboarding-required flag to document templates.
-- =============================================================================

-- 1. Onboarding tracking table
CREATE TABLE nexus_student_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,

  -- Step tracking
  current_step TEXT NOT NULL DEFAULT 'welcome'
    CHECK (current_step IN ('welcome', 'documents', 'student_info', 'exam_status', 'device_setup', 'pending_review')),

  -- Student info (Step 3)
  current_standard TEXT CHECK (current_standard IN ('10th', '11th', '12th', 'gap_year')),
  academic_year TEXT, -- e.g. '2025-26', '2026-27'

  -- Review status
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Nudge tracking
  last_nudge_at TIMESTAMPTZ,
  nudge_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, classroom_id)
);

-- Indexes
CREATE INDEX idx_nexus_onboarding_student ON nexus_student_onboarding(student_id, classroom_id);
CREATE INDEX idx_nexus_onboarding_status ON nexus_student_onboarding(status);
CREATE INDEX idx_nexus_onboarding_pending ON nexus_student_onboarding(status) WHERE status = 'submitted';

-- RLS
ALTER TABLE nexus_student_onboarding ENABLE ROW LEVEL SECURITY;

-- service_role bypass
CREATE POLICY "service_role_full_access" ON nexus_student_onboarding
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Students can read and update their own onboarding
CREATE POLICY "students_own_onboarding" ON nexus_student_onboarding
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers/admins can read and update onboarding in their classrooms
CREATE POLICY "teachers_classroom_onboarding" ON nexus_student_onboarding
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments ne
      WHERE ne.classroom_id = nexus_student_onboarding.classroom_id
        AND ne.user_id = auth.uid()
        AND ne.role IN ('teacher', 'admin')
        AND ne.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments ne
      WHERE ne.classroom_id = nexus_student_onboarding.classroom_id
        AND ne.user_id = auth.uid()
        AND ne.role IN ('teacher', 'admin')
        AND ne.is_active = true
    )
  );

-- 2. Add onboarding-required flag to document templates
ALTER TABLE nexus_document_templates
  ADD COLUMN IF NOT EXISTS is_onboarding_required BOOLEAN DEFAULT false;

-- 3. Add Signature template (doesn't exist yet)
INSERT INTO nexus_document_templates (name, description, category, applicable_standards, is_required, is_onboarding_required, sort_order, is_active)
VALUES ('Signature', 'Student signature scan or photo', 'identity', ARRAY['10th', '11th', '12th', 'gap_year'], true, true, 3, true)
ON CONFLICT DO NOTHING;

-- 4. Mark existing onboarding-required templates
UPDATE nexus_document_templates SET is_onboarding_required = true
WHERE name IN ('Aadhaar Card', 'Passport Photo', 'Signature');

-- 5. Move Passport Photo to identity category (was photo)
UPDATE nexus_document_templates SET category = 'identity'
WHERE name = 'Passport Photo';

-- 6. Add exam plan prompt tracking columns
ALTER TABLE nexus_student_exam_plans
  ADD COLUMN IF NOT EXISTS last_prompted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_prompt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prompt_snooze_until TIMESTAMPTZ;

-- 7. Updated_at trigger for onboarding table
CREATE OR REPLACE FUNCTION update_nexus_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_nexus_onboarding_updated_at
  BEFORE UPDATE ON nexus_student_onboarding
  FOR EACH ROW EXECUTE FUNCTION update_nexus_onboarding_updated_at();
