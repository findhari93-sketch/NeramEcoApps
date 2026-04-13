-- supabase/migrations/20260413_college_hub_phase5.sql

-- 1. Add auth + contact columns to college_admins
ALTER TABLE college_admins
  ADD COLUMN IF NOT EXISTS supabase_uid UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- 2. Index for fast auth lookup
CREATE UNIQUE INDEX IF NOT EXISTS college_admins_supabase_uid_idx
  ON college_admins (supabase_uid)
  WHERE supabase_uid IS NOT NULL;

-- 3. Lead windows table — globally controls when "I'm Interested" button is active
CREATE TABLE IF NOT EXISTS lead_windows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  applies_to    TEXT NOT NULL DEFAULT 'all'
                  CHECK (applies_to IN ('all', 'tnea', 'josaa')),
  eligible_tiers TEXT[] NOT NULL DEFAULT ARRAY['silver','gold','platinum'],
  is_active     BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one window can be active at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS lead_windows_single_active_idx
  ON lead_windows (is_active)
  WHERE is_active = true;

-- updated_at trigger for lead_windows
CREATE OR REPLACE FUNCTION update_lead_windows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_windows_updated_at ON lead_windows;
CREATE TRIGGER lead_windows_updated_at
  BEFORE UPDATE ON lead_windows
  FOR EACH ROW EXECUTE FUNCTION update_lead_windows_updated_at();

-- 4. College page views — anonymous analytics, public INSERT only
CREATE TABLE IF NOT EXISTS college_page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id  UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  city        TEXT,
  country     TEXT NOT NULL DEFAULT 'IN'
);

-- Index for fast aggregation queries
CREATE INDEX IF NOT EXISTS college_page_views_college_id_idx
  ON college_page_views (college_id);

CREATE INDEX IF NOT EXISTS college_page_views_viewed_at_idx
  ON college_page_views (viewed_at DESC);

-- RLS for page views: anyone can insert, nobody can select directly
ALTER TABLE college_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert page views"
  ON college_page_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No SELECT policy — only service role (admin client) can read
-- This prevents competitors from scraping view counts

-- RLS for lead_windows: read-only for anon (to check active window), write by service role only
ALTER TABLE lead_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lead windows"
  ON lead_windows FOR SELECT
  TO anon, authenticated
  USING (true);
