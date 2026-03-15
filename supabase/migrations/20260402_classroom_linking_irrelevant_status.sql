-- Add classroom linking fields to users table
-- Allows admin to link a tools app user to their Nexus classroom email
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS linked_classroom_email TEXT,
  ADD COLUMN IF NOT EXISTS linked_classroom_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linked_classroom_by UUID REFERENCES users(id);

-- Index for quick lookup by classroom email
CREATE INDEX IF NOT EXISTS idx_users_linked_classroom_email
  ON users(linked_classroom_email)
  WHERE linked_classroom_email IS NOT NULL;

-- Add 'irrelevant' to contacted_status check constraint on lead_profiles
-- First check if the constraint exists and drop it, then recreate with new value
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'lead_profiles_contacted_status_check'
  ) THEN
    ALTER TABLE lead_profiles DROP CONSTRAINT lead_profiles_contacted_status_check;
  END IF;

  -- Add updated constraint including 'irrelevant'
  ALTER TABLE lead_profiles
    ADD CONSTRAINT lead_profiles_contacted_status_check
    CHECK (contacted_status IN ('talked', 'unreachable', 'callback_scheduled', 'dead_lead', 'irrelevant'));
END $$;
