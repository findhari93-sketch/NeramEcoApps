-- Migration: Add center types, contact messages table, and notification enum update
-- This migration:
-- 1. Adds center_type enum and new columns to offline_centers
-- 2. Creates contact_messages table for storing contact form submissions
-- 3. Adds 'contact_message_received' to notification_event_type enum
-- 4. Seeds Bangalore HQ and Kanchipuram sub-office
-- 5. Updates existing centers with center_type and seo_slug

-- ============================================================
-- 1. Add center_type enum and columns to offline_centers
-- ============================================================

DO $$ BEGIN
  CREATE TYPE center_type AS ENUM ('headquarters', 'sub_office');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE offline_centers
  ADD COLUMN IF NOT EXISTS center_type center_type DEFAULT 'sub_office',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS google_reviews_url text,
  ADD COLUMN IF NOT EXISTS rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seo_slug text;

-- Add unique index on seo_slug (partial - only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_centers_seo_slug
  ON offline_centers(seo_slug) WHERE seo_slug IS NOT NULL;

-- ============================================================
-- 2. Create contact_messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  center_id UUID REFERENCES offline_centers(id),
  source TEXT DEFAULT 'contact_page',
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
  replied_by TEXT,
  replied_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_center ON contact_messages(center_id) WHERE center_id IS NOT NULL;

-- RLS
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (anon role for public form)
CREATE POLICY "Anyone can submit contact messages"
ON contact_messages FOR INSERT
TO anon
WITH CHECK (true);

-- Service role has full access (used by API routes)
CREATE POLICY "Service role full access to contact_messages"
ON contact_messages FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================
-- 3. Add notification event type
-- ============================================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'contact_message_received';

-- ============================================================
-- 4. Update existing centers with center_type and seo_slug
-- ============================================================

-- Set all existing centers as sub_offices
UPDATE offline_centers SET center_type = 'sub_office' WHERE center_type IS NULL;

-- Add seo_slug to existing centers
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-pudukkottai' WHERE slug = 'pudukkottai-main';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-pudukkottai-nata' WHERE slug = 'pudukkottai-nata';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-trichy' WHERE slug = 'trichy';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-coimbatore' WHERE slug = 'coimbatore';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-tambaram' WHERE slug = 'tambaram';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-madurai' WHERE slug = 'madurai';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-chennai' WHERE slug = 'chennai';
UPDATE offline_centers SET seo_slug = 'nata-coaching-center-in-tiruppur' WHERE slug = 'tiruppur';

-- ============================================================
-- 5. Seed Bangalore HQ
-- ============================================================

DELETE FROM offline_centers WHERE slug = 'bangalore-hq';

INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order,
  center_type, description, seo_slug
) VALUES (
  'Neram Classes - Headquarters',
  'bangalore-hq',
  'Electronic City Phase 1, Near M5 Mall',
  'Bangalore', 'Karnataka', 'IN', '560100',
  12.8456, 77.6603,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Electronic+City+Phase+1+Near+M5+Mall+Bangalore',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables', 'Projector', 'Conference Room'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  100, 0,
  true, 0,
  'headquarters',
  'Neram Classes headquarters in Bangalore Electronic City. Our main office for NATA, JEE Paper 2, and architecture entrance exam coaching.',
  'nata-coaching-center-in-bangalore'
);

-- ============================================================
-- 6. Seed Kanchipuram sub-office
-- ============================================================

DELETE FROM offline_centers WHERE slug = 'kanchipuram';

INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order,
  center_type, description, seo_slug
) VALUES (
  'Neram - NATA Coaching Center Kanchipuram',
  'kanchipuram',
  'Kanchipuram',
  'Kanchipuram', 'Tamil Nadu', 'IN', '631502',
  12.8342, 79.7036,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NATA+Coaching+Center+Kanchipuram',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  35, 0,
  true, 9,
  'sub_office',
  'Neram Classes NATA coaching center in Kanchipuram, Tamil Nadu. Expert coaching for NATA and JEE Paper 2 entrance exams.',
  'nata-coaching-center-in-kanchipuram'
);
