-- ============================================
-- Counseling College Directory
-- Maps counseling-system-specific college codes to college names.
-- Each counseling system (TNEA, KEAM, etc.) has its own set of codes.
-- ============================================

CREATE TABLE IF NOT EXISTS counseling_college_directory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id) ON DELETE CASCADE,
  college_code TEXT NOT NULL,
  college_name TEXT NOT NULL,
  city TEXT,
  district TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(counseling_system_id, college_code)
);

-- Index for fast lookup by system + code
CREATE INDEX idx_ccd_system_code ON counseling_college_directory(counseling_system_id, college_code);

-- RLS
ALTER TABLE counseling_college_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to college directory"
  ON counseling_college_directory FOR SELECT USING (true);

CREATE POLICY "Admin full access to college directory"
  ON counseling_college_directory FOR ALL USING (true);
