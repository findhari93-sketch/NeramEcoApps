-- ================================================================
-- COLLEGE HUB PHASE 1: Database Migration
-- Extends existing colleges table (32 live records preserved)
-- Creates 6 new supporting tables
-- Safe: all ALTER TABLE use ADD COLUMN IF NOT EXISTS
-- ================================================================

-- ── 1. Extend colleges table ─────────────────────────────────────
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS state_slug TEXT,
  ADD COLUMN IF NOT EXISTS location_type TEXT,
  ADD COLUMN IF NOT EXISTS nearest_railway TEXT,
  ADD COLUMN IF NOT EXISTS nearest_airport TEXT,
  ADD COLUMN IF NOT EXISTS railway_distance_km DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS airport_distance_km DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS coa_validity_till DATE,
  ADD COLUMN IF NOT EXISTS naac_valid_till DATE,
  ADD COLUMN IF NOT EXISTS nba_accredited BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nba_valid_till DATE,
  ADD COLUMN IF NOT EXISTS nirf_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS nirf_year INTEGER,
  ADD COLUMN IF NOT EXISTS arch_index_score INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_exams TEXT[],
  ADD COLUMN IF NOT EXISTS counseling_systems TEXT[],
  ADD COLUMN IF NOT EXISTS has_management_quota BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_nri_quota BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliated_university TEXT,
  ADD COLUMN IF NOT EXISTS admissions_email TEXT,
  ADD COLUMN IF NOT EXISTS admissions_phone TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS tier_start_date DATE,
  ADD COLUMN IF NOT EXISTS tier_end_date DATE,
  ADD COLUMN IF NOT EXISTS tier_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_by UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[],
  ADD COLUMN IF NOT EXISTS highlights TEXT[],
  ADD COLUMN IF NOT EXISTS about TEXT,
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS data_completeness INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_data_update TIMESTAMPTZ;

-- ── 2. Indexes for new searchable columns ────────────────────────
CREATE INDEX IF NOT EXISTS idx_colleges_state_slug ON colleges(state_slug);
CREATE INDEX IF NOT EXISTS idx_colleges_accepted_exams ON colleges USING GIN(accepted_exams);
CREATE INDEX IF NOT EXISTS idx_colleges_counseling_systems ON colleges USING GIN(counseling_systems);
CREATE INDEX IF NOT EXISTS idx_colleges_arch_index ON colleges(arch_index_score DESC NULLS LAST);

-- ── 3. Backfill state_slug ────────────────────────────────────────
UPDATE colleges
SET state_slug = regexp_replace(lower(trim(state)), '\s+', '-', 'g')
WHERE state_slug IS NULL AND state IS NOT NULL;

-- ── 4. Backfill accepted_exams + counseling_systems for TN colleges
UPDATE colleges
SET
  accepted_exams = ARRAY['NATA'],
  counseling_systems = ARRAY['TNEA']
WHERE
  state = 'Tamil Nadu'
  AND accepted_exams IS NULL;

-- ── 5. college_fees ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  fee_category TEXT NOT NULL DEFAULT 'general'
    CHECK (fee_category IN ('general', 'obc', 'obc_ncl', 'sc', 'st', 'ews', 'management', 'nri')),
  tuition DECIMAL(10,2),
  hostel DECIMAL(10,2),
  mess DECIMAL(10,2),
  exam_fees DECIMAL(10,2),
  lab_fees DECIMAL(10,2),
  library_fees DECIMAL(10,2),
  caution_deposit DECIMAL(10,2),
  other_fees DECIMAL(10,2),
  estimated_materials DECIMAL(10,2),
  estimated_field_trips DECIMAL(10,2),
  verified BOOLEAN DEFAULT false,
  verified_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year, year_number, fee_category)
);
CREATE INDEX IF NOT EXISTS idx_college_fees_college ON college_fees(college_id);

-- ── 6. college_cutoffs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_cutoffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  counseling_system TEXT NOT NULL
    CHECK (counseling_system IN ('TNEA','JoSAA','KEAM','KCET','AP_EAPCET','TS_EAPCET','other')),
  round_number INTEGER,
  category TEXT NOT NULL
    CHECK (category IN ('general','obc','obc_ncl','sc','st','ews','pwd','nri','management')),
  cutoff_type TEXT NOT NULL CHECK (cutoff_type IN ('rank','score','percentile')),
  cutoff_value DECIMAL(10,2),
  total_seats INTEGER,
  filled_seats INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year, counseling_system, round_number, category)
);
CREATE INDEX IF NOT EXISTS idx_college_cutoffs_college ON college_cutoffs(college_id);

-- ── 7. college_placements ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_placements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  highest_package_lpa DECIMAL(6,2),
  average_package_lpa DECIMAL(6,2),
  median_package_lpa DECIMAL(6,2),
  placement_rate_percent DECIMAL(5,2),
  students_placed INTEGER,
  total_eligible INTEGER,
  top_recruiters TEXT[],
  top_sectors TEXT[],
  higher_studies_percent DECIMAL(5,2),
  entrepreneurship_percent DECIMAL(5,2),
  verified BOOLEAN DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_college_placements_college ON college_placements(college_id);

-- ── 8. college_infrastructure ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_infrastructure (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE UNIQUE,
  design_studios INTEGER,
  studio_student_ratio TEXT,
  workshops TEXT[],
  software_available TEXT[],
  has_digital_fabrication BOOLEAN DEFAULT false,
  has_model_making_lab BOOLEAN DEFAULT false,
  has_material_library BOOLEAN DEFAULT false,
  has_library BOOLEAN DEFAULT true,
  library_books_count INTEGER,
  has_hostel_boys BOOLEAN,
  has_hostel_girls BOOLEAN,
  hostel_capacity INTEGER,
  hostel_type TEXT CHECK (hostel_type IN ('on_campus','off_campus','both')),
  has_mess BOOLEAN,
  has_wifi BOOLEAN DEFAULT true,
  has_sports BOOLEAN,
  sports_facilities TEXT[],
  campus_area_acres DECIMAL(6,2),
  campus_type TEXT CHECK (campus_type IN ('urban','suburban','campus_town','rural')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. college_faculty ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_faculty (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  specialization TEXT,
  qualification TEXT,
  is_practicing_architect BOOLEAN DEFAULT false,
  profile_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_college_faculty_college ON college_faculty(college_id);

-- ── 10. college_admins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_college_admins_college ON college_admins(college_id);

-- ── 11. FK: colleges.claimed_by → college_admins ─────────────────
ALTER TABLE colleges
  DROP CONSTRAINT IF EXISTS fk_colleges_claimed_by;
ALTER TABLE colleges
  ADD CONSTRAINT fk_colleges_claimed_by
  FOREIGN KEY (claimed_by) REFERENCES college_admins(id) ON DELETE SET NULL;

-- ── 12. RLS: enable on all new tables ────────────────────────────
ALTER TABLE college_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_cutoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_infrastructure ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_admins ENABLE ROW LEVEL SECURITY;

-- ── 13. RLS policies: public read on college data ─────────────────
CREATE POLICY "Public read fees" ON college_fees FOR SELECT USING (true);
CREATE POLICY "Public read cutoffs" ON college_cutoffs FOR SELECT USING (true);
CREATE POLICY "Public read placements" ON college_placements FOR SELECT USING (true);
CREATE POLICY "Public read infrastructure" ON college_infrastructure FOR SELECT USING (true);
CREATE POLICY "Public read faculty" ON college_faculty FOR SELECT USING (true);
-- college_admins: no public read (email addresses are sensitive)
