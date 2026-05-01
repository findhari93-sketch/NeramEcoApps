-- ============================================
-- AAT 2026 + PGETA 2026 Feature Tables
-- Migration: 20260501000000_aat_pgeta_content_tables
-- Mirrors the nata_* schema (see 20260311110000_nata_2026_features.sql)
-- so admin tooling, query patterns, and RLS stay consistent.
-- ============================================

-- set_updated_at() already exists from prior migrations; keep this CREATE OR REPLACE
-- as a safety net so the file is self-contained when applied to a fresh DB.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- AAT 2026 (Architecture Aptitude Test, IIT B.Arch)
-- ============================================

CREATE TABLE aat_brochures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  release_date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  changelog TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  download_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aat_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question JSONB NOT NULL DEFAULT '{}',
  answer JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'general',
  page_slug TEXT,
  year INTEGER NOT NULL DEFAULT 2026,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aat_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot TEXT NOT NULL DEFAULT 'hero',
  heading JSONB NOT NULL DEFAULT '{}',
  subtext JSONB DEFAULT '{}',
  image_url TEXT,
  mobile_image_url TEXT,
  cta_text JSONB DEFAULT '{}',
  cta_link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- PGETA 2026 (Post Graduate Entrance Test in Architecture, COA)
-- Page captures both PGETA and PGEAT search intent; data tables use the
-- canonical name (pgeta_*).
-- ============================================

CREATE TABLE pgeta_brochures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  release_date DATE NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  changelog TEXT,
  is_current BOOLEAN NOT NULL DEFAULT false,
  download_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pgeta_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question JSONB NOT NULL DEFAULT '{}',
  answer JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'general',
  page_slug TEXT,
  year INTEGER NOT NULL DEFAULT 2026,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pgeta_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot TEXT NOT NULL DEFAULT 'hero',
  heading JSONB NOT NULL DEFAULT '{}',
  subtext JSONB DEFAULT '{}',
  image_url TEXT,
  mobile_image_url TEXT,
  cta_text JSONB DEFAULT '{}',
  cta_link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_aat_brochures_active ON aat_brochures (is_active, display_order) WHERE is_active = true;
CREATE INDEX idx_aat_faqs_active ON aat_faqs (is_active, category, display_order);
CREATE INDEX idx_aat_faqs_page ON aat_faqs (page_slug, display_order) WHERE is_active = true;
CREATE INDEX idx_aat_banners_spot ON aat_banners (spot, display_order) WHERE is_active = true;

CREATE INDEX idx_pgeta_brochures_active ON pgeta_brochures (is_active, display_order) WHERE is_active = true;
CREATE INDEX idx_pgeta_faqs_active ON pgeta_faqs (is_active, category, display_order);
CREATE INDEX idx_pgeta_faqs_page ON pgeta_faqs (page_slug, display_order) WHERE is_active = true;
CREATE INDEX idx_pgeta_banners_spot ON pgeta_banners (spot, display_order) WHERE is_active = true;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE aat_brochures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active aat brochures" ON aat_brochures FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access aat brochures" ON aat_brochures FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE aat_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active aat faqs" ON aat_faqs FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access aat faqs" ON aat_faqs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE aat_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active aat banners" ON aat_banners FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access aat banners" ON aat_banners FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pgeta_brochures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active pgeta brochures" ON pgeta_brochures FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access pgeta brochures" ON pgeta_brochures FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pgeta_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active pgeta faqs" ON pgeta_faqs FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access pgeta faqs" ON pgeta_faqs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE pgeta_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active pgeta banners" ON pgeta_banners FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access pgeta banners" ON pgeta_banners FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER set_aat_brochures_updated_at BEFORE UPDATE ON aat_brochures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_aat_faqs_updated_at BEFORE UPDATE ON aat_faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_aat_banners_updated_at BEFORE UPDATE ON aat_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_pgeta_brochures_updated_at BEFORE UPDATE ON pgeta_brochures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_pgeta_faqs_updated_at BEFORE UPDATE ON pgeta_faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_pgeta_banners_updated_at BEFORE UPDATE ON pgeta_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- Storage buckets for AAT + PGETA assets
-- (info brochures, drawing-kit checklists, banner images)
-- ============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('aat-files', 'aat-files', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('pgeta-files', 'pgeta-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read aat files" ON storage.objects FOR SELECT USING (bucket_id = 'aat-files');
CREATE POLICY "Service role upload aat files" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'aat-files');
CREATE POLICY "Service role update aat files" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'aat-files');
CREATE POLICY "Service role delete aat files" ON storage.objects FOR DELETE TO service_role USING (bucket_id = 'aat-files');

CREATE POLICY "Public read pgeta files" ON storage.objects FOR SELECT USING (bucket_id = 'pgeta-files');
CREATE POLICY "Service role upload pgeta files" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'pgeta-files');
CREATE POLICY "Service role update pgeta files" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'pgeta-files');
CREATE POLICY "Service role delete pgeta files" ON storage.objects FOR DELETE TO service_role USING (bucket_id = 'pgeta-files');
