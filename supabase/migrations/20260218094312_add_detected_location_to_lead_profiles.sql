-- Add detected_location JSONB column to store geolocation-detected location data
-- separately from user-entered data. This allows admin to see both values.
ALTER TABLE lead_profiles
ADD COLUMN IF NOT EXISTS detected_location jsonb DEFAULT NULL;

COMMENT ON COLUMN lead_profiles.detected_location IS 'Auto-detected location from browser geolocation (pincode, city, state, district, country). Stored separately so it does not override user-entered values.';
