-- ============================================
-- App Feedback System (Play Store Testers)
-- ============================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE app_feedback_category AS ENUM (
    'bug_report',
    'feature_request',
    'ui_ux_issue',
    'performance',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app_feedback_status AS ENUM (
    'new',
    'reviewed',
    'in_progress',
    'resolved',
    'wont_fix'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. APP FEEDBACK TABLE
CREATE TABLE IF NOT EXISTS app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable ID (e.g., NERAM-FB-00001)
  feedback_number TEXT NOT NULL UNIQUE,

  -- Submitter info (optional — page is public, no auth required)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,

  -- Feedback content
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  category app_feedback_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  app_version TEXT,

  -- Auto-captured device info (JSON)
  device_info JSONB DEFAULT '{}',

  -- Admin triage
  status app_feedback_status NOT NULL DEFAULT 'new',
  admin_notes TEXT,

  -- Source context
  source TEXT DEFAULT 'play_store',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_app_feedback_status ON app_feedback(status);
CREATE INDEX IF NOT EXISTS idx_app_feedback_rating ON app_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_app_feedback_category ON app_feedback(category);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at ON app_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_user_id ON app_feedback(user_id) WHERE user_id IS NOT NULL;

-- 4. SEQUENCE + TRIGGER for feedback numbers
CREATE SEQUENCE IF NOT EXISTS app_feedback_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_feedback_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.feedback_number := 'NERAM-FB-' || LPAD(nextval('app_feedback_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_feedback_number ON app_feedback;
CREATE TRIGGER set_feedback_number
  BEFORE INSERT ON app_feedback
  FOR EACH ROW
  WHEN (NEW.feedback_number IS NULL OR NEW.feedback_number = '')
  EXECUTE FUNCTION generate_feedback_number();

-- Updated_at trigger (reuse existing function)
CREATE OR REPLACE TRIGGER set_app_feedback_updated_at
  BEFORE UPDATE ON app_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 5. RLS POLICIES
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to app_feedback"
  ON app_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon can INSERT (public form, no auth required)
CREATE POLICY "Anyone can submit feedback"
  ON app_feedback FOR INSERT
  TO anon
  WITH CHECK (true);

-- 6. ADD NOTIFICATION EVENT TYPE
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'feedback_submitted';

NOTIFY pgrst, 'reload schema';
