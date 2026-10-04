-- Lead attribution for the city SEO plan (agents/seo-aeo/AUDIT_REPORT_2026-10.md, Phase E).
-- Every lead keeps where the person first and last came from, the channel
-- (google_organic, ai_chatgpt, whatsapp, ...), the landing page and the page
-- code (e.g. EN-MDU) of the button they used. Additive and nullable only, so it
-- is safe to apply before or after the marketing code that writes it.

ALTER TABLE demo_class_registrations
  ADD COLUMN IF NOT EXISTS first_touch jsonb,
  ADD COLUMN IF NOT EXISTS last_touch jsonb,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS page_code text,
  -- Family demo: the parent books with the student.
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS preferred_language text;

ALTER TABLE callback_requests
  ADD COLUMN IF NOT EXISTS first_touch jsonb,
  ADD COLUMN IF NOT EXISTS last_touch jsonb,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS page_code text;

ALTER TABLE nata_assistance_requests
  ADD COLUMN IF NOT EXISTS first_touch jsonb,
  ADD COLUMN IF NOT EXISTS last_touch jsonb,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS page_code text;

ALTER TABLE center_visit_bookings
  ADD COLUMN IF NOT EXISTS first_touch jsonb,
  ADD COLUMN IF NOT EXISTS last_touch jsonb,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS page_code text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;

-- Leads-by-channel report (Admin).
CREATE INDEX IF NOT EXISTS idx_demo_class_registrations_channel ON demo_class_registrations (channel);
CREATE INDEX IF NOT EXISTS idx_callback_requests_channel ON callback_requests (channel);
CREATE INDEX IF NOT EXISTS idx_nata_assistance_requests_channel ON nata_assistance_requests (channel);
CREATE INDEX IF NOT EXISTS idx_center_visit_bookings_channel ON center_visit_bookings (channel);
