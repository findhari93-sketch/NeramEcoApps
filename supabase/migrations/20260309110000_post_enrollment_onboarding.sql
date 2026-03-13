-- Post-Enrollment Onboarding Steps System
-- Tracks setup steps students must complete after enrollment (common for regular + direct enrollment)

-- ============================================
-- Table 1: onboarding_step_definitions
-- Admin-configurable step templates
-- ============================================

CREATE TABLE IF NOT EXISTS onboarding_step_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Step identity
  step_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,

  -- Action config
  action_type TEXT NOT NULL DEFAULT 'manual' CHECK (action_type IN ('link', 'in_app', 'manual')),
  action_config JSONB DEFAULT '{}',

  -- Ordering and status
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT true,

  -- Applicability
  applies_to TEXT[] NOT NULL DEFAULT ARRAY['regular', 'direct'],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_onboarding_step_defs_order
  ON onboarding_step_definitions (display_order) WHERE is_active = true;

-- ============================================
-- Table 2: student_onboarding_progress
-- Per-student step completion tracking
-- ============================================

CREATE TABLE IF NOT EXISTS student_onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  step_definition_id UUID NOT NULL REFERENCES onboarding_step_definitions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Completion tracking
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by_type TEXT CHECK (completed_by_type IN ('student', 'admin')),
  completed_by_user_id UUID REFERENCES users(id),

  -- Notes
  admin_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One progress row per student per step
  UNIQUE (student_profile_id, step_definition_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_student_onboarding_student
  ON student_onboarding_progress (student_profile_id);
CREATE INDEX IF NOT EXISTS idx_student_onboarding_step
  ON student_onboarding_progress (step_definition_id);
CREATE INDEX IF NOT EXISTS idx_student_onboarding_incomplete
  ON student_onboarding_progress (student_profile_id) WHERE is_completed = false;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE onboarding_step_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Step definitions: public read (students need to see them)
CREATE POLICY "Anyone can read step definitions"
  ON onboarding_step_definitions FOR SELECT USING (true);

-- Step definitions: only service role can mutate (admin uses service role key)
CREATE POLICY "Service role can manage step definitions"
  ON onboarding_step_definitions FOR ALL USING (
    (SELECT auth.role()) = 'service_role'
  );

-- Progress: students can read their own
CREATE POLICY "Students can read own onboarding progress"
  ON student_onboarding_progress FOR SELECT USING (user_id = auth.uid());

-- Progress: students can update their own
CREATE POLICY "Students can update own onboarding progress"
  ON student_onboarding_progress FOR UPDATE USING (user_id = auth.uid());

-- Progress: service role can do everything (admin)
CREATE POLICY "Service role can manage onboarding progress"
  ON student_onboarding_progress FOR ALL USING (
    (SELECT auth.role()) = 'service_role'
  );

-- ============================================
-- Function to initialize onboarding for a student
-- ============================================

CREATE OR REPLACE FUNCTION initialize_student_onboarding(
  p_student_profile_id UUID,
  p_user_id UUID,
  p_enrollment_type TEXT DEFAULT 'regular'
) RETURNS void AS $$
BEGIN
  INSERT INTO student_onboarding_progress (student_profile_id, step_definition_id, user_id)
  SELECT p_student_profile_id, d.id, p_user_id
  FROM onboarding_step_definitions d
  WHERE d.is_active = true
    AND p_enrollment_type = ANY(d.applies_to)
  ON CONFLICT (student_profile_id, step_definition_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_onboarding_step_defs_updated_at
  BEFORE UPDATE ON onboarding_step_definitions
  FOR EACH ROW EXECUTE FUNCTION update_onboarding_updated_at();

CREATE TRIGGER set_student_onboarding_progress_updated_at
  BEFORE UPDATE ON student_onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION update_onboarding_updated_at();

-- ============================================
-- Seed initial onboarding steps
-- ============================================

INSERT INTO onboarding_step_definitions (step_key, title, description, icon_name, action_type, action_config, display_order, is_required, applies_to) VALUES
  ('join_whatsapp', 'Join WhatsApp Group', 'Join the class WhatsApp group for updates and communication with teachers and fellow students', 'WhatsApp', 'link', '{"url": ""}', 1, true, ARRAY['regular', 'direct']),
  ('install_teams', 'Install Microsoft Teams', 'Download and install Microsoft Teams app for attending online classes', 'Laptop', 'link', '{"url": "https://www.microsoft.com/en/microsoft-teams/download-app"}', 2, true, ARRAY['regular', 'direct']),
  ('join_teams_class', 'Join MS Teams Class', 'Join your assigned class team on Microsoft Teams using the invite sent to your email', 'Groups', 'manual', '{}', 3, true, ARRAY['regular', 'direct']),
  ('complete_profile', 'Complete Profile Setup', 'Upload your passport photo and fill in remaining profile details like parent information', 'Person', 'in_app', '{"route": "/profile/complete"}', 4, true, ARRAY['regular', 'direct']);
