-- Migration: Exam Schedule & User Exam Details Collection
-- Adds admin-managed exam schedules, user exam city tracking,
-- user-reported centers, and edit audit trail

-- 1. Admin-managed exam schedules (from CoA brochure)
CREATE TABLE IF NOT EXISTS exam_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_type TEXT NOT NULL,
  exam_year INT NOT NULL,
  is_active BOOLEAN DEFAULT true,

  -- Registration window
  registration_open_date DATE,
  registration_close_date DATE,
  late_registration_close_date DATE,

  -- Sessions (JSONB array for flexibility)
  sessions JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  brochure_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(exam_type, exam_year)
);

-- 2. Extend user_exam_attempts with city/center tracking
ALTER TABLE user_exam_attempts
  ADD COLUMN IF NOT EXISTS exam_city TEXT,
  ADD COLUMN IF NOT EXISTS exam_state TEXT,
  ADD COLUMN IF NOT EXISTS exam_center_id UUID REFERENCES nata_exam_centers(id),
  ADD COLUMN IF NOT EXISTS user_reported_city TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered';

-- Add check constraint for status (safe: only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_exam_attempts_status_check'
  ) THEN
    ALTER TABLE user_exam_attempts
      ADD CONSTRAINT user_exam_attempts_status_check
      CHECK (status IN ('registered', 'completed', 'skipped'));
  END IF;
END $$;

-- 3. Extend user_exam_profiles with setup completion flag
ALTER TABLE user_exam_profiles
  ADD COLUMN IF NOT EXISTS exam_details_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS exam_details_completed_at TIMESTAMPTZ;

-- 4. User-reported exam centers (for admin verification)
CREATE TABLE IF NOT EXISTS user_reported_exam_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_year INT NOT NULL,
  session_label TEXT,
  reported_city TEXT NOT NULL,
  reported_state TEXT,
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  linked_center_id UUID REFERENCES nata_exam_centers(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_reported_exam_centers_verification_check'
  ) THEN
    ALTER TABLE user_reported_exam_centers
      ADD CONSTRAINT user_reported_exam_centers_verification_check
      CHECK (verification_status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- 5. Edit audit trail
CREATE TABLE IF NOT EXISTS exam_detail_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  changes JSONB NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_detail_audit_logs_action_check'
  ) THEN
    ALTER TABLE exam_detail_audit_logs
      ADD CONSTRAINT exam_detail_audit_logs_action_check
      CHECK (action IN ('created', 'updated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_audit_user
  ON exam_detail_audit_logs(user_id, created_at DESC);

-- 6. RLS Policies

-- exam_schedules: public read, admin write
ALTER TABLE exam_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exam schedules"
  ON exam_schedules FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage exam schedules"
  ON exam_schedules FOR ALL
  USING (true)
  WITH CHECK (true);

-- user_reported_exam_centers: users see own, admin sees all
ALTER TABLE user_reported_exam_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reported centers"
  ON user_reported_exam_centers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reported centers"
  ON user_reported_exam_centers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage reported centers"
  ON user_reported_exam_centers FOR ALL
  USING (true)
  WITH CHECK (true);

-- exam_detail_audit_logs: users see own, admin sees all
ALTER TABLE exam_detail_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audit logs"
  ON exam_detail_audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage audit logs"
  ON exam_detail_audit_logs FOR ALL
  USING (true)
  WITH CHECK (true);
