-- App-wide settings table (WhatsApp group link, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access to app_settings" ON app_settings FOR ALL USING (true);

-- Seed WhatsApp group link setting
INSERT INTO app_settings (setting_key, setting_value)
VALUES ('whatsapp_group_url', '{"url": "", "description": "WhatsApp group invite link for students"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Secure credential vault for MS Teams login transfer
CREATE TABLE IF NOT EXISTS student_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL DEFAULT 'ms_teams' CHECK (credential_type IN ('ms_teams', 'nexus')),
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  destroyed_at TIMESTAMPTZ,
  auto_destroy_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE student_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access to student_credentials" ON student_credentials FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_student_credentials_user ON student_credentials(user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_student_credentials_student_profile ON student_credentials(student_profile_id) WHERE is_active = TRUE;

-- Add status column to student_onboarding_progress
ALTER TABLE student_onboarding_progress
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'need_help'));

UPDATE student_onboarding_progress SET status = 'completed' WHERE is_completed = TRUE AND status = 'pending';
