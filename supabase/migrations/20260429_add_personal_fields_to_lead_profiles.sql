-- Add personal detail columns to lead_profiles that were missing
-- These fields were collected in the enrollment form but never persisted

ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS gender TEXT;

-- Backfill first_name from users table for existing records
UPDATE lead_profiles lp
SET first_name = u.first_name
FROM users u
WHERE lp.user_id = u.id
  AND lp.first_name IS NULL
  AND u.first_name IS NOT NULL;

-- Backfill date_of_birth and gender from users table where available
UPDATE lead_profiles lp
SET
  date_of_birth = COALESCE(lp.date_of_birth, u.date_of_birth),
  gender = COALESCE(lp.gender, u.gender)
FROM users u
WHERE lp.user_id = u.id
  AND (lp.date_of_birth IS NULL OR lp.gender IS NULL);
