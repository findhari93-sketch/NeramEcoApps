-- Migration: Question Moderation Notifications + Callback Rescheduling + Question Change Requests
-- Date: 2026-03-07

-- ============================================
-- 1. NEW NOTIFICATION EVENT TYPES
-- ============================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'question_submitted';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'question_edit_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'question_delete_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'callback_reminder';

-- ============================================
-- 2. CALLBACK IMPROVEMENTS
-- ============================================

-- New enum for callback attempt outcomes
DO $$ BEGIN
  CREATE TYPE callback_outcome AS ENUM (
    'talked',
    'not_picked_up',
    'not_reachable',
    'rescheduled',
    'dead_lead'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend callback_requests.status CHECK constraint to include 'dead_lead'
-- (status is TEXT with CHECK, not an enum)
ALTER TABLE callback_requests DROP CONSTRAINT IF EXISTS callback_requests_status_check;
ALTER TABLE callback_requests ADD CONSTRAINT callback_requests_status_check
  CHECK (status IN ('pending', 'scheduled', 'attempted', 'completed', 'cancelled', 'dead_lead'));

-- Add new columns to callback_requests
ALTER TABLE callback_requests ADD COLUMN IF NOT EXISTS scheduled_callback_at TIMESTAMPTZ;
ALTER TABLE callback_requests ADD COLUMN IF NOT EXISTS is_dead_lead BOOLEAN NOT NULL DEFAULT false;

-- Extend contacted_status on lead_profiles to include 'dead_lead'
-- contacted_status is a TEXT column with a CHECK constraint
ALTER TABLE lead_profiles DROP CONSTRAINT IF EXISTS lead_profiles_contacted_status_check;
ALTER TABLE lead_profiles ADD CONSTRAINT lead_profiles_contacted_status_check
  CHECK (contacted_status IS NULL OR contacted_status IN ('talked', 'unreachable', 'callback_scheduled', 'dead_lead'));

-- New table: callback_attempts (tracks each individual callback attempt/outcome)
CREATE TABLE IF NOT EXISTS callback_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callback_request_id UUID REFERENCES callback_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  admin_id UUID NOT NULL REFERENCES users(id),
  admin_name TEXT NOT NULL,
  outcome callback_outcome NOT NULL,
  comments TEXT,
  rescheduled_to TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for callback_attempts
CREATE INDEX IF NOT EXISTS idx_callback_attempts_user ON callback_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_callback_attempts_request ON callback_attempts(callback_request_id);
CREATE INDEX IF NOT EXISTS idx_callback_attempts_admin ON callback_attempts(admin_id);

-- Index for finding due callback reminders
CREATE INDEX IF NOT EXISTS idx_callback_requests_scheduled
  ON callback_requests(scheduled_callback_at)
  WHERE status = 'scheduled' AND is_dead_lead = false AND scheduled_callback_at IS NOT NULL;

-- RLS for callback_attempts
ALTER TABLE callback_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access callback_attempts"
  ON callback_attempts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 3. QUESTION CHANGE REQUESTS
-- ============================================

-- Enums for change request types
DO $$ BEGIN
  CREATE TYPE question_change_request_type AS ENUM ('edit', 'delete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE question_change_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New table: question_change_requests
CREATE TABLE IF NOT EXISTS question_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type question_change_request_type NOT NULL,

  -- For edit requests: the proposed new content (NULL for delete requests)
  proposed_title TEXT,
  proposed_body TEXT,
  proposed_category nata_question_category,
  proposed_image_urls TEXT[] DEFAULT '{}',
  proposed_tags TEXT[] DEFAULT '{}',

  -- For delete requests: user-provided reason
  reason TEXT,

  -- Admin moderation
  status question_change_request_status NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for question_change_requests
CREATE INDEX IF NOT EXISTS idx_qcr_question ON question_change_requests(question_id);
CREATE INDEX IF NOT EXISTS idx_qcr_user ON question_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_qcr_pending ON question_change_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_qcr_type_status ON question_change_requests(request_type, status);

-- RLS for question_change_requests
ALTER TABLE question_change_requests ENABLE ROW LEVEL SECURITY;

-- Service role full access (server-side operations)
CREATE POLICY "Service role full access change requests"
  ON question_change_requests FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Updated_at trigger (reuse existing function if available)
CREATE OR REPLACE FUNCTION update_question_change_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_change_requests_updated_at
  BEFORE UPDATE ON question_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_question_change_request_updated_at();
