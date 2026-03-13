-- Add parent_phone column to lead_profiles and direct_enrollment_links
-- Already applied manually to staging & production

ALTER TABLE lead_profiles ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE direct_enrollment_links ADD COLUMN IF NOT EXISTS parent_phone TEXT;

NOTIFY pgrst, 'reload schema';
