-- Add payment link token columns to lead_profiles
-- Used for generating shareable payment links for students without email/Google auth
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS payment_link_token uuid,
  ADD COLUMN IF NOT EXISTS payment_link_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS lead_profiles_payment_link_token_idx
  ON lead_profiles (payment_link_token)
  WHERE payment_link_token IS NOT NULL;
