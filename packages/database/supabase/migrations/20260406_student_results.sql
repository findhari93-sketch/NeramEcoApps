-- Student Results Showcase
-- Stores student exam results with photos and scorecards for the marketing site

CREATE TABLE IF NOT EXISTS student_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  photo_url TEXT,
  scorecard_url TEXT,
  scorecard_watermarked_url TEXT,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee_paper2', 'tnea', 'other')),
  exam_year INT NOT NULL,
  score DECIMAL,
  max_score DECIMAL,
  rank INT,
  percentile DECIMAL,
  college_name TEXT,
  college_city TEXT,
  course_name TEXT,
  student_quote TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE student_results IS 'Student exam results for marketing showcase (photos, scorecards, scores, college placements)';
COMMENT ON COLUMN student_results.slug IS 'URL-friendly identifier, e.g. nata-2026-rahul-kumar';
COMMENT ON COLUMN student_results.scorecard_url IS 'Original scorecard image (private bucket)';
COMMENT ON COLUMN student_results.scorecard_watermarked_url IS 'Watermarked scorecard image (public bucket)';
COMMENT ON COLUMN student_results.is_featured IS 'Show in featured carousel and homepage section';
COMMENT ON COLUMN student_results.is_published IS 'Controls visibility on public marketing site';
COMMENT ON COLUMN student_results.display_order IS 'Manual sort order for featured results (lower = first)';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_student_results_slug ON student_results (slug);
CREATE INDEX IF NOT EXISTS idx_student_results_published ON student_results (is_published, exam_type, exam_year);
CREATE INDEX IF NOT EXISTS idx_student_results_featured ON student_results (is_published, is_featured, display_order);

-- Enable RLS
ALTER TABLE student_results ENABLE ROW LEVEL SECURITY;

-- Public can read published results
CREATE POLICY "Public can view published student results"
  ON student_results FOR SELECT
  USING (is_published = true);

-- Service role has full access (for admin API)
CREATE POLICY "Service role has full access to student results"
  ON student_results FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_student_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER student_results_updated_at
  BEFORE UPDATE ON student_results
  FOR EACH ROW
  EXECUTE FUNCTION update_student_results_updated_at();
