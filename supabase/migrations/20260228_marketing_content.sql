-- ============================================
-- Marketing Content Table
-- Dynamic content managed from admin, displayed on marketing site
-- Types: achievement, important_date, announcement, update
-- ============================================

-- Create enum type for marketing content types
CREATE TYPE marketing_content_type AS ENUM (
  'achievement',
  'important_date',
  'announcement',
  'update'
);

-- Create enum type for marketing content status
CREATE TYPE marketing_content_status AS ENUM (
  'draft',
  'published',
  'archived'
);

-- Create the marketing_content table
CREATE TABLE marketing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Type discriminator
  type marketing_content_type NOT NULL,

  -- Core content (multilingual JSONB: { "en": "...", "ta": "..." })
  title JSONB NOT NULL DEFAULT '{}',
  description JSONB DEFAULT '{}',

  -- Media
  image_url TEXT,

  -- Type-specific metadata (JSONB)
  -- achievement: { student_name, exam, score, rank, percentile, college, academic_year, batch, student_quote }
  -- important_date: { target_date, original_date, is_extended, event_type }
  -- announcement: { link_url, link_text, badge_text, badge_color }
  -- update: { category, link_url }
  metadata JSONB DEFAULT '{}',

  -- Status & visibility
  status marketing_content_status NOT NULL DEFAULT 'draft',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  display_priority INTEGER NOT NULL DEFAULT 0,

  -- Time-bound display
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Admin tracking
  created_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_marketing_content_published
  ON marketing_content (status, type, display_priority DESC, published_at DESC)
  WHERE status = 'published';

CREATE INDEX idx_marketing_content_active_dates
  ON marketing_content (starts_at, expires_at)
  WHERE status = 'published';

CREATE INDEX idx_marketing_content_pinned
  ON marketing_content (is_pinned, display_priority DESC)
  WHERE is_pinned = true AND status = 'published';

CREATE INDEX idx_marketing_content_type
  ON marketing_content (type, status);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE marketing_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published marketing content"
  ON marketing_content
  FOR SELECT
  USING (status = 'published');

CREATE POLICY "Service role has full access to marketing content"
  ON marketing_content
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_marketing_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketing_content_updated_at
  BEFORE UPDATE ON marketing_content
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_content_updated_at();
