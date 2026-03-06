-- ============================================================
-- NATA EXAM CENTERS - Supabase Migration
-- For: app.neramclasses.com (Neram Ecosystem - tools PWA)
-- ============================================================

-- 1. Create the exam_centers table
CREATE TABLE IF NOT EXISTS public.nata_exam_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Location fields
  state TEXT NOT NULL,
  city_brochure TEXT NOT NULL,            -- City name as in CoA brochure
  brochure_ref TEXT,                       -- e.g., "19.1" for Chennai under TN
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  city_population_tier TEXT CHECK (city_population_tier IN ('Metro', 'Tier-1', 'Tier-2', 'Tier-3', 'International')),
  
  -- Probable center details (Option 1 - Primary)
  probable_center_1 TEXT,
  center_1_address TEXT,
  center_1_evidence TEXT,
  
  -- Probable center details (Option 2 - Alternate)
  probable_center_2 TEXT,
  center_2_address TEXT,
  center_2_evidence TEXT,
  
  -- Classification & metadata
  confidence TEXT CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')) DEFAULT 'LOW',
  is_new_2025 BOOLEAN DEFAULT false,
  was_in_2024 BOOLEAN DEFAULT false,
  tcs_ion_confirmed BOOLEAN DEFAULT false,
  has_barch_college BOOLEAN DEFAULT false,
  notes TEXT,
  
  -- Year tracking (critical for year-over-year management)
  year INTEGER NOT NULL DEFAULT 2025,
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Unique constraint: one entry per city per year
  UNIQUE(city_brochure, state, year)
);

-- 2. Enable RLS
ALTER TABLE public.nata_exam_centers ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Public read access (for the tools app - app.neramclasses.com)
CREATE POLICY "Public can read exam centers"
  ON public.nata_exam_centers
  FOR SELECT
  USING (true);

-- Admin write access (for admin.neramclasses.com)
-- Adjust the role check based on your auth setup
CREATE POLICY "Admins can insert exam centers"
  ON public.nata_exam_centers
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can update exam centers"
  ON public.nata_exam_centers
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can delete exam centers"
  ON public.nata_exam_centers
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- 4. Indexes for performance
CREATE INDEX idx_nata_centers_year ON public.nata_exam_centers(year);
CREATE INDEX idx_nata_centers_state ON public.nata_exam_centers(state);
CREATE INDEX idx_nata_centers_confidence ON public.nata_exam_centers(confidence);
CREATE INDEX idx_nata_centers_geo ON public.nata_exam_centers(latitude, longitude);
CREATE INDEX idx_nata_centers_city_year ON public.nata_exam_centers(city_brochure, year);

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_nata_centers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_nata_centers_updated_at
  BEFORE UPDATE ON public.nata_exam_centers
  FOR EACH ROW
  EXECUTE FUNCTION update_nata_centers_updated_at();

-- 6. Useful views

-- Current year centers (always latest)
CREATE OR REPLACE VIEW public.nata_current_centers AS
SELECT * FROM public.nata_exam_centers
WHERE year = (SELECT MAX(year) FROM public.nata_exam_centers);

-- Year-over-year comparison view
CREATE OR REPLACE VIEW public.nata_centers_yoy AS
SELECT 
  c.state,
  c.city_brochure,
  c.year,
  c.probable_center_1,
  c.confidence,
  c.is_new_2025 as is_new_this_year,
  CASE WHEN p.id IS NOT NULL THEN true ELSE false END as existed_previous_year,
  p.probable_center_1 as previous_year_center
FROM public.nata_exam_centers c
LEFT JOIN public.nata_exam_centers p 
  ON c.city_brochure = p.city_brochure 
  AND c.state = p.state 
  AND p.year = c.year - 1;

-- State-wise summary
CREATE OR REPLACE VIEW public.nata_state_summary AS
SELECT 
  state,
  year,
  COUNT(*) as total_cities,
  COUNT(*) FILTER (WHERE confidence = 'HIGH') as high_confidence,
  COUNT(*) FILTER (WHERE confidence = 'MEDIUM') as medium_confidence,
  COUNT(*) FILTER (WHERE confidence = 'LOW') as low_confidence,
  COUNT(*) FILTER (WHERE tcs_ion_confirmed) as tcs_confirmed,
  COUNT(*) FILTER (WHERE has_barch_college) as with_barch_colleges
FROM public.nata_exam_centers
GROUP BY state, year
ORDER BY state, year;

-- 7. Function: Clone centers to new year (for year-over-year management)
CREATE OR REPLACE FUNCTION clone_centers_to_new_year(
  source_year INTEGER,
  target_year INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  rows_inserted INTEGER;
BEGIN
  INSERT INTO public.nata_exam_centers (
    state, city_brochure, brochure_ref, latitude, longitude,
    city_population_tier, probable_center_1, center_1_address,
    center_1_evidence, probable_center_2, center_2_address,
    center_2_evidence, confidence, is_new_2025, was_in_2024,
    tcs_ion_confirmed, has_barch_college, notes, year
  )
  SELECT 
    state, city_brochure, brochure_ref, latitude, longitude,
    city_population_tier, probable_center_1, center_1_address,
    center_1_evidence, probable_center_2, center_2_address,
    center_2_evidence, confidence, false, true,
    tcs_ion_confirmed, has_barch_college, notes, target_year
  FROM public.nata_exam_centers
  WHERE year = source_year
  ON CONFLICT (city_brochure, state, year) DO NOTHING;
  
  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RETURN rows_inserted;
END;
$$ LANGUAGE plpgsql;
