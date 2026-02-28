-- Site-wide settings (key-value store)
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "Service role has full access to site_settings"
ON site_settings FOR ALL
USING (true)
WITH CHECK (true);

-- Public: read-only
CREATE POLICY "Public can read site_settings"
ON site_settings FOR SELECT
USING (true);

-- Seed default demo class settings
INSERT INTO site_settings (key, value) VALUES
  ('demo_class', '{"youtube_video_url": ""}')
ON CONFLICT (key) DO NOTHING;
