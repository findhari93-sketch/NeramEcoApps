-- ============================================================
-- Nexus Question Bank: Unified Repository Foundations (Phase 0)
-- ------------------------------------------------------------
-- Additive, no-behavior-change groundwork for the unified
-- question repository + reusable test engine:
--   1. Managed tag registry (nexus_qb_tags + nexus_qb_question_tags)
--   2. Provenance flag (nexus_qb_questions.origin)
--   3. Native dedupe support (pg_trgm + normalized generated column + GIN)
--   4. Seed tags from the existing QBCategory vocabulary + exam + themes
--   5. Backfill question_tags (from categories[] and exam_relevance) + origin
--
-- Everything here is idempotent and reversible. It does NOT change
-- any existing read/write path; getQBQuestions, category counts, and
-- the categories[] column all keep working unchanged.
-- ============================================================

-- ============================================================
-- 0. Enums
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nexus_qb_tag_group') THEN
    CREATE TYPE nexus_qb_tag_group AS ENUM ('exam', 'subject', 'theme');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nexus_qb_origin') THEN
    CREATE TYPE nexus_qb_origin AS ENUM ('pyq', 'authored', 'student_recalled', 'imported');
  END IF;
END $$;

-- ============================================================
-- 1. Tag registry
-- ============================================================
CREATE TABLE IF NOT EXISTS nexus_qb_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type nexus_qb_tag_group NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  parent_id UUID REFERENCES nexus_qb_tags(id) ON DELETE SET NULL,  -- optional hierarchy within a group
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,   -- curated/locked vs teacher-added
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_qb_tags_group ON nexus_qb_tags(group_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nexus_qb_tags_parent ON nexus_qb_tags(parent_id) WHERE is_active = true;

-- Many-to-many: a question carries many tags ("titles")
CREATE TABLE IF NOT EXISTS nexus_qb_question_tags (
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES nexus_qb_tags(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, tag_id)
);

-- Reverse lookup: all questions carrying a tag (PK already covers question_id-leading lookups)
CREATE INDEX IF NOT EXISTS idx_nexus_qb_question_tags_tag ON nexus_qb_question_tags(tag_id);

-- ============================================================
-- 2. Provenance flag on questions
--    Cheap denormalization of "has no exam-source rows" so authored /
--    practice questions never pollute the "browse by year paper" views.
-- ============================================================
ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS origin nexus_qb_origin NOT NULL DEFAULT 'authored';

CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_origin ON nexus_qb_questions(origin) WHERE is_active = true;

-- ============================================================
-- 3. Dedupe support: pg_trgm + normalized generated column + GIN
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalizer: lowercase, strip HTML tags, drop punctuation / LaTeX, collapse whitespace.
-- IMMUTABLE + PARALLEL SAFE so it can back a generated STORED column.
CREATE OR REPLACE FUNCTION nexus_qb_normalize(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(t, '')), '<[^>]*>', ' ', 'g'),  -- strip HTML tags
        '[^a-z0-9]+', ' ', 'g'                                        -- drop punctuation / LaTeX / symbols
      ),
      '\s+', ' ', 'g'                                                 -- collapse whitespace
    )
  )
$$;

-- Generated STORED column stays in sync with question_text automatically (no trigger).
ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS question_text_norm text
  GENERATED ALWAYS AS (nexus_qb_normalize(question_text)) STORED;

CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_text_trgm
  ON nexus_qb_questions USING gin (question_text_norm gin_trgm_ops);

-- ------------------------------------------------------------
-- 3b. Dedupe probe + tag-count RPCs (DB-side, indexed, cheap)
-- ------------------------------------------------------------

-- Near-duplicate finder: normalized trigram match, scoped by exam + tags,
-- returns each candidate's similarity and how many tests already use it.
CREATE OR REPLACE FUNCTION nexus_qb_find_similar(
  p_text text,
  p_exam_relevance text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL,
  p_threshold real DEFAULT 0.35,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,
  similarity real,
  used_in_tests bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_norm text := nexus_qb_normalize(p_text);
BEGIN
  IF v_norm = '' THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT q.id,
         q.question_text,
         q.options,
         similarity(q.question_text_norm, v_norm) AS sim,
         (SELECT count(*) FROM nexus_test_questions tq WHERE tq.qb_question_id = q.id) AS used_in_tests
  FROM nexus_qb_questions q
  WHERE q.is_active = true
    AND q.question_text_norm % v_norm                                  -- GIN trigram candidate recall
    AND (p_exam_relevance IS NULL
         OR q.exam_relevance = p_exam_relevance
         OR q.exam_relevance = 'BOTH')
    AND (p_tag_ids IS NULL
         OR array_length(p_tag_ids, 1) IS NULL
         OR EXISTS (SELECT 1 FROM nexus_qb_question_tags t
                    WHERE t.question_id = q.id AND t.tag_id = ANY(p_tag_ids)))
    AND similarity(q.question_text_norm, v_norm) >= p_threshold
  ORDER BY sim DESC
  LIMIT p_limit;
END;
$$;

-- Active-question count per tag (for filter chips + registry management)
CREATE OR REPLACE FUNCTION nexus_qb_tag_counts()
RETURNS TABLE (tag_id uuid, question_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT qt.tag_id, count(*)::bigint
  FROM nexus_qb_question_tags qt
  JOIN nexus_qb_questions q ON q.id = qt.question_id AND q.is_active = true
  GROUP BY qt.tag_id
$$;

-- ============================================================
-- 4. Row level security (service-role only, matching the QB pattern)
-- ============================================================
ALTER TABLE nexus_qb_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_qb_question_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_qb_tags" ON nexus_qb_tags;
CREATE POLICY "service_role_qb_tags" ON nexus_qb_tags FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_qb_question_tags" ON nexus_qb_question_tags;
CREATE POLICY "service_role_qb_question_tags" ON nexus_qb_question_tags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Seed tag vocabulary
-- ============================================================

-- 5a. Exam tags (core, locked)
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('exam', 'jee', 'JEE Paper 2', true, 1),
  ('exam', 'nata', 'NATA', true, 2)
ON CONFLICT (slug) DO NOTHING;

-- 5b. Subject tags (the existing QBCategory vocabulary, core/locked).
--     Labels derived from slug; admins can rename later via the registry.
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order)
SELECT 'subject', s.slug, initcap(replace(s.slug, '_', ' ')), true, s.ord
FROM (VALUES
  ('mathematics', 1), ('aptitude', 2), ('drawing', 3),
  -- NATA
  ('history_of_architecture', 10), ('general_knowledge', 11), ('puzzle', 12),
  ('perspective', 13), ('building_materials', 14), ('building_services', 15),
  ('planning', 16), ('sustainability', 17), ('famous_architects', 18),
  ('current_affairs', 19), ('visualization_3d', 20),
  -- JEE Aptitude
  ('spatial_visualization', 30), ('orthographic_projection', 31), ('pattern_recognition', 32),
  ('analogy', 33), ('counting_figures', 34), ('odd_one_out', 35), ('surface_counting', 36),
  ('mirror_image', 37), ('embedded_figure', 38), ('architecture_gk', 39),
  ('building_science', 40), ('design_fundamentals', 41),
  -- JEE Mathematics
  ('trigonometry', 50), ('probability', 51), ('statistics', 52), ('matrices', 53),
  ('determinants', 54), ('complex_numbers', 55), ('vectors', 56), ('3d_geometry', 57),
  ('conic_sections', 58), ('circles', 59), ('straight_lines', 60), ('sequences_and_series', 61),
  ('binomial_theorem', 62), ('permutations_combinations', 63), ('definite_integrals', 64),
  ('indefinite_integrals', 65), ('differential_equations', 66), ('applications_of_derivatives', 67),
  ('differentiability', 68), ('continuity', 69), ('mean_value_theorems', 70),
  ('quadratic_equations', 71), ('functions', 72), ('sets_and_relations', 73),
  ('mathematical_logic', 74)
) AS s(slug, ord)
ON CONFLICT (slug) DO NOTHING;

-- 5c. Theme tags (starter examples, editable by teachers/admins)
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('theme', 'islamic_architecture', 'Islamic Architecture', false, 1),
  ('theme', 'architecture_around_the_world', 'Architecture Around the World', false, 2),
  ('theme', 'general_architecture_knowledge', 'General Architecture Knowledge', false, 3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 6. Backfill question_tags
-- ============================================================

-- 6a. From existing categories[] -> subject tags (slug match)
INSERT INTO nexus_qb_question_tags (question_id, tag_id)
SELECT DISTINCT q.id, t.id
FROM nexus_qb_questions q
CROSS JOIN LATERAL unnest(q.categories) AS c(slug)
JOIN nexus_qb_tags t ON t.slug = c.slug
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- 6b. From exam_relevance -> exam tags (so tag-based exam filtering matches the column)
INSERT INTO nexus_qb_question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM nexus_qb_questions q
JOIN nexus_qb_tags t
  ON t.group_type = 'exam'
 AND ( (t.slug = 'jee'  AND q.exam_relevance IN ('JEE', 'BOTH'))
    OR (t.slug = 'nata' AND q.exam_relevance IN ('NATA', 'BOTH')) )
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- ============================================================
-- 7. Backfill origin
-- ============================================================

-- 7a. Real PYQ = has an exam-source row AND is not a drawing prompt
--     (drawing questions carry a year-source but are teacher-curated practice).
UPDATE nexus_qb_questions q
SET origin = 'pyq'
WHERE origin = 'authored'
  AND question_format <> 'DRAWING_PROMPT'
  AND EXISTS (SELECT 1 FROM nexus_qb_question_sources s WHERE s.question_id = q.id);

-- 7b. Student-recalled questions (guarded: answer_source column may not exist in all envs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nexus_qb_questions' AND column_name = 'answer_source'
  ) THEN
    UPDATE nexus_qb_questions
    SET origin = 'student_recalled'
    WHERE answer_source = 'student_recalled';
  END IF;
END $$;
