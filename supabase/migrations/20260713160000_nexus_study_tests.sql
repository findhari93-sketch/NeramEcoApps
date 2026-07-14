-- Per-PDF tests for Study Materials. A test is MANDATORY to complete a chapter: a student reaches
-- "completed" only by passing the file's linked test (score >= passing_pct). Mirrors the proven
-- Class-Recap MCQ/grading/completion shapes but scoped to a single study file (one test per file).
--
-- RLS enabled with NO policies (deny-by-default): all access via the service-role admin client with
-- checks in the API layer, matching the other nexus_study_* tables.

CREATE TABLE IF NOT EXISTS nexus_study_tests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      UUID NOT NULL UNIQUE REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  title        TEXT,
  passing_pct  INTEGER NOT NULL DEFAULT 70 CHECK (passing_pct BETWEEN 1 AND 100),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexus_study_test_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        UUID NOT NULL REFERENCES nexus_study_tests(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT,
  option_d       TEXT,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
  explanation    TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nexus_study_test_questions_test
  ON nexus_study_test_questions (test_id);

CREATE TABLE IF NOT EXISTS nexus_study_test_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        UUID NOT NULL REFERENCES nexus_study_tests(id) ON DELETE CASCADE,
  file_id        UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers        JSONB NOT NULL DEFAULT '{}',
  correct_count  INTEGER NOT NULL DEFAULT 0,
  total_count    INTEGER NOT NULL DEFAULT 0,
  score_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  passed         BOOLEAN NOT NULL DEFAULT false,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nexus_study_test_attempts_student
  ON nexus_study_test_attempts (student_id, file_id);

-- Mark a file completed for a student on a passing attempt, keeping the best score. Idempotent.
CREATE OR REPLACE FUNCTION nexus_study_mark_completed(p_user uuid, p_file uuid, p_score numeric, p_attempt uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO nexus_study_file_reads (user_id, file_id, opened_at, completed_at, best_score_pct, best_attempt_id, last_activity_at)
  VALUES (p_user, p_file, NOW(), NOW(), p_score, p_attempt, NOW())
  ON CONFLICT (user_id, file_id) DO UPDATE SET
    completed_at    = COALESCE(nexus_study_file_reads.completed_at, NOW()),
    best_score_pct  = GREATEST(COALESCE(nexus_study_file_reads.best_score_pct, 0), EXCLUDED.best_score_pct),
    best_attempt_id = CASE
                        WHEN EXCLUDED.best_score_pct >= COALESCE(nexus_study_file_reads.best_score_pct, 0)
                        THEN EXCLUDED.best_attempt_id
                        ELSE nexus_study_file_reads.best_attempt_id
                      END,
    last_activity_at = NOW();
$$;

ALTER TABLE nexus_study_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_study_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_study_test_attempts ENABLE ROW LEVEL SECURITY;
