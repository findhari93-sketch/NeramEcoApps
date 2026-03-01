-- ============================================================
-- Score Calculations
-- Stores every cutoff calculator run for logged-in users.
-- Separate from tool_usage_logs (analytics-only, anonymous).
-- ============================================================

-- 1. Purpose enum
CREATE TYPE calculation_purpose AS ENUM (
  'actual_score',  -- "This is my actual score"
  'prediction',    -- "I'm predicting / planning"
  'target',        -- "Testing a target I want to achieve"
  'exploring'      -- "Just exploring"
);

-- 2. score_calculations table
CREATE TABLE IF NOT EXISTS score_calculations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name     TEXT NOT NULL DEFAULT 'cutoff_calculator',
  -- forward-proof: 'jee_cutoff_calculator', 'nata_rank_estimator', etc.
  input_data    JSONB NOT NULL,
  -- cutoff_calculator fields:
  -- { board, qualificationType, maxMarks, marksSecured,
  --   attempts: [{partA, partB}], hasPreviousYear, previousYearScore, attemptCount }
  result_data   JSONB NOT NULL,
  -- { boardConverted, boardPercentage, boardEligible,
  --   bestNataScore, finalCutoff, overallEligible, prevYearInvalid, nataExplanation }
  purpose       calculation_purpose,  -- NULL until user picks (updated via PATCH)
  label         TEXT,                 -- optional free-text note from user
  academic_year TEXT,                 -- e.g. "2025-2026"
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Indexes
CREATE INDEX idx_score_calc_user_id   ON score_calculations(user_id);
CREATE INDEX idx_score_calc_tool_name ON score_calculations(tool_name);
CREATE INDEX idx_score_calc_created   ON score_calculations(created_at DESC);
CREATE INDEX idx_score_calc_user_tool ON score_calculations(user_id, tool_name, created_at DESC);

-- 4. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_score_calculations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_score_calc_updated_at
  BEFORE UPDATE ON score_calculations
  FOR EACH ROW EXECUTE FUNCTION update_score_calculations_updated_at();

-- 5. RLS Policies
-- Users own their data. Admin reads via getSupabaseAdminClient() which bypasses RLS.
ALTER TABLE score_calculations ENABLE ROW LEVEL SECURITY;

-- Users can read their own calculations
CREATE POLICY "Users can read own calculations"
  ON score_calculations FOR SELECT
  USING (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  );

-- Users can insert their own calculations
CREATE POLICY "Users can insert own calculations"
  ON score_calculations FOR INSERT
  WITH CHECK (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  );

-- Users can update purpose/label on their own calculations
CREATE POLICY "Users can update own calculations"
  ON score_calculations FOR UPDATE
  USING (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  )
  WITH CHECK (
    auth.uid()::text IN (
      SELECT firebase_uid FROM users WHERE id = user_id
    )
  );
