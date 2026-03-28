-- ============================================
-- Onboarding Redesign: Phased Journey with Smart Dependencies
-- ============================================
-- Adds: course_group_links table, phase column on step definitions,
--        new tracking fields on progress, new step definitions

-- ============================================
-- 1. New Table: course_group_links
-- ============================================

CREATE TABLE IF NOT EXISTS course_group_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- WhatsApp
  whatsapp_group_url TEXT,

  -- Teams Group Chat (general chat group for the course)
  teams_group_chat_url TEXT,
  teams_group_chat_id TEXT,

  -- Teams Class Team (the actual class team for lectures/assignments)
  teams_class_team_url TEXT,
  teams_class_team_id TEXT,

  -- Metadata
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(course_id)
);

-- RLS
ALTER TABLE course_group_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read course group links"
  ON course_group_links FOR SELECT USING (true);

CREATE POLICY "Service role manages course group links"
  ON course_group_links FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

-- Updated_at trigger (reuse existing function if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_onboarding_updated_at') THEN
    CREATE TRIGGER set_course_group_links_updated_at
      BEFORE UPDATE ON course_group_links
      FOR EACH ROW EXECUTE FUNCTION update_onboarding_updated_at();
  ELSE
    -- Fallback: create a generic updated_at trigger function
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    CREATE TRIGGER set_course_group_links_updated_at
      BEFORE UPDATE ON course_group_links
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ============================================
-- 2. Add phase column to onboarding_step_definitions
-- ============================================

ALTER TABLE onboarding_step_definitions
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'get_ready';

-- Add check constraint (drop first if exists to be safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_step_definitions_phase_check'
  ) THEN
    ALTER TABLE onboarding_step_definitions
      ADD CONSTRAINT onboarding_step_definitions_phase_check
      CHECK (phase IN ('get_ready', 'access_your_account', 'complete_nexus_setup', 'secure_your_account'));
  END IF;
END $$;

-- ============================================
-- 3. Add tracking fields to student_onboarding_progress
-- ============================================

ALTER TABLE student_onboarding_progress
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_add_attempted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_add_result TEXT;

-- ============================================
-- 4. Update existing step definitions with phase values
-- ============================================

UPDATE onboarding_step_definitions
  SET phase = 'get_ready', display_order = 1
  WHERE step_key = 'join_whatsapp';

UPDATE onboarding_step_definitions
  SET phase = 'get_ready', display_order = 2
  WHERE step_key = 'install_teams';

UPDATE onboarding_step_definitions
  SET phase = 'access_your_account', display_order = 6
  WHERE step_key = 'join_teams_class';

-- Deactivate complete_profile step
UPDATE onboarding_step_definitions
  SET is_active = false
  WHERE step_key = 'complete_profile';

-- ============================================
-- 5. Insert new step definitions
-- ============================================

INSERT INTO onboarding_step_definitions (step_key, title, description, icon_name, action_type, action_config, display_order, is_required, applies_to, phase)
VALUES
  (
    'install_authenticator',
    'Install Microsoft Authenticator',
    'Required for secure login to your Teams account',
    'Laptop',
    'link',
    '{"url": "https://www.microsoft.com/en/security/mobile-authenticator-app", "android_url": "https://play.google.com/store/apps/details?id=com.azure.authenticator", "ios_url": "https://apps.apple.com/app/microsoft-authenticator/id983156458"}',
    3,
    true,
    ARRAY['regular', 'direct'],
    'get_ready'
  ),
  (
    'view_credentials',
    'View Your Credentials',
    'View the Microsoft Teams login credentials shared by your admin',
    'Key',
    'in_app',
    '{}',
    4,
    true,
    ARRAY['regular', 'direct'],
    'access_your_account'
  ),
  (
    'confirm_login_terms',
    'Confirm Login & Agree to Terms',
    'Confirm you have logged into Teams and Authenticator, and agree to the credential usage terms',
    'Lock',
    'in_app',
    '{}',
    5,
    true,
    ARRAY['regular', 'direct'],
    'access_your_account'
  ),
  (
    'go_to_nexus',
    'Complete Nexus Onboarding',
    'Log in to Nexus using your Teams credentials to complete your classroom setup',
    'Groups',
    'link',
    '{"url": ""}',
    7,
    true,
    ARRAY['regular', 'direct'],
    'complete_nexus_setup'
  ),
  (
    'delete_credentials',
    'Delete Credentials',
    'Securely delete your credentials after saving them in a safe place',
    'Lock',
    'in_app',
    '{}',
    8,
    true,
    ARRAY['regular', 'direct'],
    'secure_your_account'
  )
ON CONFLICT (step_key) DO NOTHING;

-- ============================================
-- 6. Add new progress rows for existing enrolled students
-- ============================================

-- For each existing student who has onboarding progress,
-- create progress rows for the newly added steps
INSERT INTO student_onboarding_progress (student_profile_id, step_definition_id, user_id, status)
SELECT DISTINCT sp.id, sd.id, sp.user_id, 'pending'
FROM student_profiles sp
CROSS JOIN onboarding_step_definitions sd
WHERE sd.is_active = true
  AND sd.step_key IN ('install_authenticator', 'view_credentials', 'confirm_login_terms', 'go_to_nexus', 'delete_credentials')
  AND EXISTS (
    -- Only for students who already have onboarding progress (i.e., enrolled)
    SELECT 1 FROM student_onboarding_progress sop WHERE sop.student_profile_id = sp.id
  )
ON CONFLICT (student_profile_id, step_definition_id) DO NOTHING;
