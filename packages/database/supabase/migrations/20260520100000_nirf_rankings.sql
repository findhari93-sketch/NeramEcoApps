-- NIRF Architecture rankings, multi-year history
-- Designed so unmatched scraped rows live alongside matched ones; the
-- match_status column gates which rows are visible publicly. The query
-- layer (not RLS) enforces "matched/manual only" for public reads, so
-- service-role review tooling can still see pending rows.

CREATE TABLE IF NOT EXISTS nirf_rankings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id      UUID REFERENCES colleges(id) ON DELETE SET NULL,
  category        TEXT NOT NULL DEFAULT 'architecture',
  year            INTEGER NOT NULL CHECK (year BETWEEN 2016 AND 2099),
  rank            INTEGER NOT NULL,
  rank_band       TEXT,
  score           NUMERIC(5,2),
  tlr             NUMERIC(5,2),
  rpc             NUMERIC(5,2),
  go              NUMERIC(5,2),
  oi              NUMERIC(5,2),
  pr              NUMERIC(5,2),
  source_name     TEXT NOT NULL,
  source_city     TEXT,
  source_state    TEXT,
  source_url      TEXT NOT NULL,
  match_status    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (match_status IN ('pending','matched','unmatched','manual','ignored')),
  match_score     NUMERIC(4,3),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent upsert keys (partial unique indexes)
CREATE UNIQUE INDEX IF NOT EXISTS nirf_rankings_unique_matched
  ON nirf_rankings (college_id, category, year)
  WHERE college_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS nirf_rankings_unique_unmatched
  ON nirf_rankings (LOWER(source_name), COALESCE(LOWER(source_city),''), category, year)
  WHERE college_id IS NULL;

CREATE INDEX IF NOT EXISTS nirf_rankings_year_rank_idx ON nirf_rankings (category, year, rank);
CREATE INDEX IF NOT EXISTS nirf_rankings_college_idx   ON nirf_rankings (college_id, year DESC);
CREATE INDEX IF NOT EXISTS nirf_rankings_state_idx     ON nirf_rankings (source_state);

ALTER TABLE nirf_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON nirf_rankings;
CREATE POLICY "Public read access" ON nirf_rankings FOR SELECT USING (true);

DROP TRIGGER IF EXISTS set_nirf_rankings_updated_at ON nirf_rankings;
CREATE TRIGGER set_nirf_rankings_updated_at
  BEFORE UPDATE ON nirf_rankings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE nirf_rankings IS
  'NIRF rankings history. One row per (college, category, year). Unmatched scraped rows have college_id IS NULL and match_status IN (pending, unmatched).';
COMMENT ON COLUMN nirf_rankings.tlr IS 'Teaching, Learning & Resources (0-100)';
COMMENT ON COLUMN nirf_rankings.rpc IS 'Research & Professional Practice (0-100)';
COMMENT ON COLUMN nirf_rankings.go  IS 'Graduation Outcomes (0-100)';
COMMENT ON COLUMN nirf_rankings.oi  IS 'Outreach & Inclusivity (0-100)';
COMMENT ON COLUMN nirf_rankings.pr  IS 'Perception (0-100)';
