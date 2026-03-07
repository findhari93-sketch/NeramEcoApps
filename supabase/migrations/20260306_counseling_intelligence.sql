-- ============================================================
-- Counseling Intelligence — Full Schema
-- Creates all tables needed for the aiArchitek counseling system.
-- Extends existing colleges and user_exam_profiles tables.
-- ============================================================

-- ============================================================
-- 1. EXTEND COLLEGES TABLE
-- Add counseling-specific columns to existing colleges table.
-- ============================================================
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS coa_approved BOOLEAN DEFAULT true;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS naac_grade TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS nirf_rank_architecture INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS annual_fee_approx INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS total_barch_seats INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS neram_tier TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS placement_data JSONB;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS facilities_data JSONB;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS updated_by TEXT;


-- ============================================================
-- 2. COUNSELING SYSTEMS
-- Config table for each state/national counseling process.
-- One row per counseling system (TNEA B.Arch, KEAM, JoSAA, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS counseling_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL,
  conducting_body TEXT NOT NULL,
  conducting_body_full TEXT,
  official_website TEXT,
  merit_formula JSONB NOT NULL,
  exams_accepted TEXT[] NOT NULL,
  categories JSONB NOT NULL,
  special_reservations JSONB,
  typical_counseling_months TEXT,
  typical_rounds INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 3. COLLEGE COUNSELING PARTICIPATION
-- Links colleges to counseling systems, per year.
-- A college can participate in multiple systems.
-- ============================================================
CREATE TABLE IF NOT EXISTS college_counseling_participation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id) ON DELETE CASCADE,
  college_code TEXT NOT NULL,
  branches JSONB NOT NULL,
  year INTEGER NOT NULL,
  seat_matrix JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, counseling_system_id, year)
);

CREATE INDEX IF NOT EXISTS idx_ccp_college ON college_counseling_participation(college_id);
CREATE INDEX IF NOT EXISTS idx_ccp_system ON college_counseling_participation(counseling_system_id);
CREATE INDEX IF NOT EXISTS idx_ccp_system_year ON college_counseling_participation(counseling_system_id, year);


-- ============================================================
-- 4. HISTORICAL CUTOFFS
-- One row per college x year x round x branch x category.
-- Flexible category column supports any state's reservation system.
-- ============================================================
CREATE TABLE IF NOT EXISTS historical_cutoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  college_id UUID NOT NULL REFERENCES colleges(id),
  year INTEGER NOT NULL,
  round TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  category TEXT NOT NULL,
  closing_mark DECIMAL(10,4),
  closing_rank INTEGER,
  opening_mark DECIMAL(10,4),
  opening_rank INTEGER,
  seats_available INTEGER,
  seats_filled INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(counseling_system_id, college_id, year, round, branch_code, category)
);

CREATE INDEX IF NOT EXISTS idx_cutoffs_system_year ON historical_cutoffs(counseling_system_id, year);
CREATE INDEX IF NOT EXISTS idx_cutoffs_college ON historical_cutoffs(college_id);
CREATE INDEX IF NOT EXISTS idx_cutoffs_lookup ON historical_cutoffs(counseling_system_id, year, category);


-- ============================================================
-- 5. RANK LIST ENTRIES
-- Every student from rank list PDFs (anonymized — no names).
-- Used for: Composite Score → Rank prediction.
-- ============================================================
CREATE TABLE IF NOT EXISTS rank_list_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  year INTEGER NOT NULL,
  serial_number INTEGER,
  rank INTEGER NOT NULL,
  hsc_aggregate_mark DECIMAL(10,4),
  entrance_exam_mark DECIMAL(10,4),
  aggregate_mark DECIMAL(10,4) NOT NULL,
  community TEXT NOT NULL,
  community_rank INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(counseling_system_id, year, rank)
);

CREATE INDEX IF NOT EXISTS idx_rank_entries_system_year ON rank_list_entries(counseling_system_id, year);
CREATE INDEX IF NOT EXISTS idx_rank_entries_score ON rank_list_entries(counseling_system_id, year, aggregate_mark);
CREATE INDEX IF NOT EXISTS idx_rank_entries_community ON rank_list_entries(counseling_system_id, year, community);
CREATE INDEX IF NOT EXISTS idx_rank_entries_rank ON rank_list_entries(counseling_system_id, year, rank);


-- ============================================================
-- 6. ALLOTMENT LIST ENTRIES
-- Every student from allotment list PDFs (anonymized — no names).
-- Used for: College-specific predictions, "who got which college".
-- ============================================================
CREATE TABLE IF NOT EXISTS allotment_list_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  year INTEGER NOT NULL,
  serial_number INTEGER,
  rank INTEGER NOT NULL,
  aggregate_mark DECIMAL(10,4) NOT NULL,
  community TEXT NOT NULL,
  college_code TEXT NOT NULL,
  college_id UUID REFERENCES colleges(id),
  branch_code TEXT NOT NULL,
  allotted_category TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_allotment_system_year ON allotment_list_entries(counseling_system_id, year);
CREATE INDEX IF NOT EXISTS idx_allotment_college ON allotment_list_entries(college_id, year);
CREATE INDEX IF NOT EXISTS idx_allotment_rank ON allotment_list_entries(counseling_system_id, year, rank);


-- ============================================================
-- 7. EXTEND USER EXAM PROFILES
-- Add counseling-specific fields for prediction tools.
-- All new columns are nullable so existing rows aren't broken.
-- ============================================================
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS state_domicile TEXT;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS board_type TEXT;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS board_marks JSONB;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS nata_score DECIMAL(6,3);
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS jee_paper2_score DECIMAL(6,3);
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS counseling_categories JSONB;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS first_graduate BOOLEAN DEFAULT false;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS govt_school_student BOOLEAN DEFAULT false;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS pwd_status BOOLEAN DEFAULT false;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS nri_status BOOLEAN DEFAULT false;
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS preferred_states TEXT[];
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS college_type_preference TEXT[];
ALTER TABLE user_exam_profiles ADD COLUMN IF NOT EXISTS budget_max INTEGER;


-- ============================================================
-- 8. PREDICTION LOGS
-- Track every prediction run for analytics.
-- ============================================================
CREATE TABLE IF NOT EXISTS prediction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  prediction_type TEXT NOT NULL,
  counseling_systems TEXT[] NOT NULL,
  data_year INTEGER NOT NULL,
  input_data JSONB NOT NULL,
  results_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_logs_user ON prediction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_type ON prediction_logs(prediction_type);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_created ON prediction_logs(created_at DESC);


-- ============================================================
-- 9. COUNSELING AUDIT LOG
-- Track every admin data change for accountability.
-- ============================================================
CREATE TABLE IF NOT EXISTS counseling_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  context JSONB
);

CREATE INDEX IF NOT EXISTS idx_caud_table ON counseling_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_caud_record ON counseling_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_caud_changed_at ON counseling_audit_log(changed_at);


-- ============================================================
-- 10. RLS POLICIES
-- ============================================================

-- Counseling Systems: public read
ALTER TABLE counseling_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read counseling_systems"
  ON counseling_systems FOR SELECT USING (true);

-- College Counseling Participation: public read
ALTER TABLE college_counseling_participation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read college_counseling_participation"
  ON college_counseling_participation FOR SELECT USING (true);

-- Historical Cutoffs: public read
ALTER TABLE historical_cutoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read historical_cutoffs"
  ON historical_cutoffs FOR SELECT USING (true);

-- Rank List Entries: public read
ALTER TABLE rank_list_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rank_list_entries"
  ON rank_list_entries FOR SELECT USING (true);

-- Allotment List Entries: public read
ALTER TABLE allotment_list_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read allotment_list_entries"
  ON allotment_list_entries FOR SELECT USING (true);

-- Prediction Logs: user writes own, reads own
ALTER TABLE prediction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own prediction_logs"
  ON prediction_logs FOR SELECT
  USING (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  );
CREATE POLICY "Users can insert prediction_logs"
  ON prediction_logs FOR INSERT
  WITH CHECK (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  );

-- Counseling Audit Log: admin read only (writes via service role bypass RLS)
ALTER TABLE counseling_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read counseling_audit_log"
  ON counseling_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE firebase_uid = auth.uid()::text
      AND user_type = 'admin'
    )
  );


-- ============================================================
-- 11. AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_counseling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_counseling_systems_updated_at
  BEFORE UPDATE ON counseling_systems
  FOR EACH ROW EXECUTE FUNCTION update_counseling_updated_at();

CREATE TRIGGER trg_ccp_updated_at
  BEFORE UPDATE ON college_counseling_participation
  FOR EACH ROW EXECUTE FUNCTION update_counseling_updated_at();

CREATE TRIGGER trg_historical_cutoffs_updated_at
  BEFORE UPDATE ON historical_cutoffs
  FOR EACH ROW EXECUTE FUNCTION update_counseling_updated_at();
