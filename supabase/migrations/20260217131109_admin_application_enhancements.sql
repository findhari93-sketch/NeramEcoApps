-- Admin application management enhancements
-- Adds contacted status, payment recommendation, and full payment discount columns

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS contacted_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contacted_by UUID REFERENCES users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_recommendation TEXT DEFAULT 'full';

-- Add 'application_approved' to notification_event_type enum
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'application_approved';

-- Add 'deleted' to application_status enum if not already present
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'deleted';
