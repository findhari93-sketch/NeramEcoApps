-- Migration: 004_profile_enhancements
-- Description: Add profile fields, history tracking, and avatar management
-- Date: 2026-02-06

-- ============================================
-- EXTEND USERS TABLE
-- ============================================

-- Add new profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS area_of_interest TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;

-- Add check constraint for gender
ALTER TABLE users ADD CONSTRAINT users_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

-- Add index for username lookups (used for username-based login)
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));

-- ============================================
-- USER PROFILE HISTORY TABLE
-- ============================================

-- Track all profile changes for admin visibility
CREATE TABLE IF NOT EXISTS user_profile_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What changed
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,

  -- Change metadata
  changed_by UUID REFERENCES users(id), -- NULL if user changed their own
  change_source TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin', 'system'
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_profile_history_user_id ON user_profile_history(user_id);
CREATE INDEX idx_profile_history_created_at ON user_profile_history(created_at DESC);
CREATE INDEX idx_profile_history_field_name ON user_profile_history(field_name);

-- Add check constraint for change_source
ALTER TABLE user_profile_history ADD CONSTRAINT profile_history_source_check
  CHECK (change_source IN ('user', 'admin', 'system'));

-- ============================================
-- USER AVATARS TABLE
-- ============================================

-- Store avatar history with crop data
CREATE TABLE IF NOT EXISTS user_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Avatar data
  storage_path TEXT NOT NULL, -- Supabase Storage path: profile-pictures/{user_id}/{filename}
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,

  -- Dimensions (for cropped images)
  width INTEGER,
  height INTEGER,
  crop_data JSONB, -- {x, y, width, height, zoom, rotation}

  -- Status
  is_current BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX idx_user_avatars_current ON user_avatars(user_id) WHERE is_current = TRUE;

-- Ensure only one current avatar per user (partial unique index)
CREATE UNIQUE INDEX idx_user_avatars_one_current ON user_avatars(user_id) WHERE is_current = TRUE;

-- Add check constraint for mime_type
ALTER TABLE user_avatars ADD CONSTRAINT user_avatars_mime_check
  CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'));

-- ============================================
-- AREA OF INTEREST ENUM (for validation)
-- ============================================

-- Create enum type for area of interest options
DO $$ BEGIN
  CREATE TYPE area_of_interest_type AS ENUM (
    'nata',
    'jee_paper_2',
    'b_arch',
    'interior_design',
    'landscape_architecture',
    'urban_planning',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on new tables
ALTER TABLE user_profile_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;

-- User profile history policies
-- Users can view their own history
CREATE POLICY "Users can view own profile history" ON user_profile_history
  FOR SELECT USING (auth.uid()::text = user_id::text);

-- Service role can do everything
CREATE POLICY "Service role has full access to profile history" ON user_profile_history
  USING (auth.role() = 'service_role');

-- User avatars policies
-- Users can manage their own avatars
CREATE POLICY "Users can view own avatars" ON user_avatars
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own avatars" ON user_avatars
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own avatars" ON user_avatars
  FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Public can view current avatars (for avatar URLs)
CREATE POLICY "Public can view current avatars" ON user_avatars
  FOR SELECT USING (is_current = TRUE);

-- Service role can do everything
CREATE POLICY "Service role has full access to avatars" ON user_avatars
  USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to record profile changes
CREATE OR REPLACE FUNCTION record_profile_change(
  p_user_id UUID,
  p_field_name TEXT,
  p_old_value TEXT,
  p_new_value TEXT,
  p_changed_by UUID DEFAULT NULL,
  p_change_source TEXT DEFAULT 'user',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  -- Only record if value actually changed
  IF p_old_value IS DISTINCT FROM p_new_value THEN
    INSERT INTO user_profile_history (
      user_id, field_name, old_value, new_value,
      changed_by, change_source, ip_address, user_agent
    ) VALUES (
      p_user_id, p_field_name, p_old_value, p_new_value,
      p_changed_by, p_change_source, p_ip_address, p_user_agent
    ) RETURNING id INTO v_history_id;

    RETURN v_history_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set current avatar (and unset previous)
CREATE OR REPLACE FUNCTION set_current_avatar(
  p_user_id UUID,
  p_avatar_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Unset all current avatars for this user
  UPDATE user_avatars
  SET is_current = FALSE
  WHERE user_id = p_user_id AND is_current = TRUE;

  -- Set the new current avatar
  UPDATE user_avatars
  SET is_current = TRUE
  WHERE id = p_avatar_id AND user_id = p_user_id;

  -- Update user's avatar_url
  UPDATE users
  SET avatar_url = (
    SELECT storage_path FROM user_avatars WHERE id = p_avatar_id
  ),
  updated_at = NOW()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check username availability
CREATE OR REPLACE FUNCTION check_username_available(
  p_username TEXT,
  p_exclude_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM users
    WHERE LOWER(username) = LOWER(p_username)
    AND (p_exclude_user_id IS NULL OR id != p_exclude_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to suggest usernames
CREATE OR REPLACE FUNCTION suggest_usernames(
  p_base_username TEXT,
  p_count INTEGER DEFAULT 3
) RETURNS TEXT[] AS $$
DECLARE
  suggestions TEXT[] := ARRAY[]::TEXT[];
  candidate TEXT;
  i INTEGER := 1;
BEGIN
  -- Clean the base username
  p_base_username := LOWER(REGEXP_REPLACE(p_base_username, '[^a-z0-9_.]', '', 'g'));

  -- Try variations
  WHILE array_length(suggestions, 1) IS NULL OR array_length(suggestions, 1) < p_count LOOP
    -- Try with underscore and number
    candidate := p_base_username || '_' || i;
    IF check_username_available(candidate) THEN
      suggestions := array_append(suggestions, candidate);
    END IF;

    -- Try with dot and number
    candidate := p_base_username || '.' || i;
    IF check_username_available(candidate) AND
       (array_length(suggestions, 1) IS NULL OR array_length(suggestions, 1) < p_count) THEN
      suggestions := array_append(suggestions, candidate);
    END IF;

    -- Try with year
    IF i = 1 THEN
      candidate := p_base_username || '_2026';
      IF check_username_available(candidate) AND
         (array_length(suggestions, 1) IS NULL OR array_length(suggestions, 1) < p_count) THEN
        suggestions := array_append(suggestions, candidate);
      END IF;
    END IF;

    i := i + 1;

    -- Safety limit
    IF i > 100 THEN EXIT; END IF;
  END LOOP;

  RETURN suggestions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Split existing 'name' into first_name and last_name where possible
UPDATE users
SET
  first_name = SPLIT_PART(name, ' ', 1),
  last_name = CASE
    WHEN POSITION(' ' IN name) > 0 THEN SUBSTRING(name FROM POSITION(' ' IN name) + 1)
    ELSE NULL
  END
WHERE first_name IS NULL AND name IS NOT NULL;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION record_profile_change TO authenticated;
GRANT EXECUTE ON FUNCTION set_current_avatar TO authenticated;
GRANT EXECUTE ON FUNCTION check_username_available TO authenticated, anon;
GRANT EXECUTE ON FUNCTION suggest_usernames TO authenticated, anon;
