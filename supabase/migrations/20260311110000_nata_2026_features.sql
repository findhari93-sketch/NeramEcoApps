-- ============================================
-- NATA 2026 Feature Tables
-- Migration: 20260311_nata_2026_features
-- Applied to: staging + production via MCP
-- ============================================

-- Ensure set_updated_at function exists
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. NATA Brochures (downloadable PDFs)
CREATE TABLE nata_brochures (
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

-- 2. NATA FAQs
CREATE TABLE nata_faqs (
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

-- 3. NATA Announcements
CREATE TABLE nata_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text JSONB NOT NULL DEFAULT '{}',
  link TEXT,
  bg_color TEXT NOT NULL DEFAULT '#1976d2',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  severity TEXT NOT NULL DEFAULT 'info',
  year INTEGER NOT NULL DEFAULT 2026,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. NATA Banners
CREATE TABLE nata_banners (
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

-- 5. NATA Assistance Requests
CREATE TABLE nata_assistance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  district TEXT,
  school_name TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_nata_brochures_active ON nata_brochures (is_active, display_order) WHERE is_active = true;
CREATE INDEX idx_nata_faqs_active ON nata_faqs (is_active, category, display_order);
CREATE INDEX idx_nata_faqs_page ON nata_faqs (page_slug, display_order) WHERE is_active = true;
CREATE INDEX idx_nata_announcements_active ON nata_announcements (is_active, priority DESC) WHERE is_active = true;
CREATE INDEX idx_nata_banners_spot ON nata_banners (spot, display_order) WHERE is_active = true;
CREATE INDEX idx_nata_assistance_status ON nata_assistance_requests (status, created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE nata_brochures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active brochures" ON nata_brochures FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access brochures" ON nata_brochures FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nata_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active faqs" ON nata_faqs FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access faqs" ON nata_faqs FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nata_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active announcements" ON nata_announcements FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access announcements" ON nata_announcements FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nata_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active banners" ON nata_banners FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access banners" ON nata_banners FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nata_assistance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit assistance request" ON nata_assistance_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access assistance" ON nata_assistance_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER set_nata_brochures_updated_at BEFORE UPDATE ON nata_brochures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_nata_faqs_updated_at BEFORE UPDATE ON nata_faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_nata_announcements_updated_at BEFORE UPDATE ON nata_announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_nata_banners_updated_at BEFORE UPDATE ON nata_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_nata_assistance_updated_at BEFORE UPDATE ON nata_assistance_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- Storage bucket for NATA files
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('nata-files', 'nata-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read nata files" ON storage.objects FOR SELECT USING (bucket_id = 'nata-files');
CREATE POLICY "Service role upload nata files" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = 'nata-files');
CREATE POLICY "Service role update nata files" ON storage.objects FOR UPDATE TO service_role USING (bucket_id = 'nata-files');
CREATE POLICY "Service role delete nata files" ON storage.objects FOR DELETE TO service_role USING (bucket_id = 'nata-files');
