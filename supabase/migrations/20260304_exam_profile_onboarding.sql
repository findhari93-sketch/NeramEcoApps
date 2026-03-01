-- Phase 3: Exam Profile Onboarding Gate
-- Mandatory onboarding before accessing Question Bank.
-- Captures NATA exam status, attempt history, and planning details.

-- ============================================================
-- 1. NATA status enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE nata_exam_status AS ENUM (
    'attempted',           -- Has attempted NATA before
    'applied_waiting',     -- Applied and waiting for exam
    'planning_to_apply',   -- Planning to apply (future year)
    'not_interested'       -- Not interested / doesn't apply
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. User Exam Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_exam_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  nata_status nata_exam_status NOT NULL,
  attempt_count INTEGER DEFAULT 0,
  next_exam_date DATE,
  planning_year INTEGER,
  qb_onboarding_completed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_exam_profiles_user ON user_exam_profiles(user_id);

-- ============================================================
-- 3. User Exam Attempts (individual past attempts)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_exam_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_date DATE,
  exam_year INTEGER NOT NULL,
  session_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_exam_attempts_user ON user_exam_attempts(user_id);

-- ============================================================
-- 4. RLS Policies
-- ============================================================
ALTER TABLE user_exam_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exam_attempts ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/write their own
CREATE POLICY "Users can read own exam profile"
  ON user_exam_profiles FOR SELECT
  USING (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

CREATE POLICY "Users can insert own exam profile"
  ON user_exam_profiles FOR INSERT
  WITH CHECK (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

CREATE POLICY "Users can update own exam profile"
  ON user_exam_profiles FOR UPDATE
  USING (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

-- Attempts: users can read/write their own
CREATE POLICY "Users can read own exam attempts"
  ON user_exam_attempts FOR SELECT
  USING (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

CREATE POLICY "Users can insert own exam attempts"
  ON user_exam_attempts FOR INSERT
  WITH CHECK (auth.uid()::text IN (
    SELECT firebase_uid FROM users WHERE id = user_id
  ));

-- Admins can read all (for analytics)
CREATE POLICY "Admins can read all exam profiles"
  ON user_exam_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE firebase_uid = auth.uid()::text
      AND user_type = 'admin'
    )
  );

CREATE POLICY "Admins can read all exam attempts"
  ON user_exam_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE firebase_uid = auth.uid()::text
      AND user_type = 'admin'
    )
  );
