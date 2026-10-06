-- AI Tutor, part 1: the concept graph.
--
-- nexus_qb_question_study.concepts holds 1,188 free-text concept names
-- written per question, so "dot product" and "scalar product of vectors" are
-- two different things there. The tutor needs one name per idea, so mastery
-- can build up across questions and a prerequisite can point at it.
--
-- Rows are written by scripts/qb-concepts.ts (--apply), never by the app.
-- A concept belongs to one maths chapter tag (nexus_qb_tags), and may require
-- other concepts (a DAG; the script refuses a cycle before writing).

CREATE TABLE IF NOT EXISTS nexus_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- '<chapter_slug>.<concept>', e.g. 'vector_algebra.dot_product'. Stable: tutor packs name concepts by slug.
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  label text NOT NULL,
  chapter_tag_id uuid NOT NULL REFERENCES nexus_qb_tags(id) ON DELETE RESTRICT,
  ncert_ref text,
  summary text,
  -- The free-text names from nexus_qb_question_study that mean this concept (lower case).
  aliases text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'staff')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_concepts_chapter ON nexus_concepts (chapter_tag_id, sort_order);

CREATE TABLE IF NOT EXISTS nexus_concept_prereqs (
  concept_id uuid NOT NULL REFERENCES nexus_concepts(id) ON DELETE CASCADE,
  requires_id uuid NOT NULL REFERENCES nexus_concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, requires_id),
  CHECK (concept_id <> requires_id)
);

-- Which concepts a question needs. 'core' = the concept the question is
-- about (its chapter is the question's primary chapter); 'uses' = needed on
-- the way. The tutor pack's own concept list wins over the alias mapping.
CREATE TABLE IF NOT EXISTS nexus_qb_question_concepts (
  question_id uuid NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES nexus_concepts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'core' CHECK (role IN ('core', 'uses')),
  source text NOT NULL DEFAULT 'alias' CHECK (source IN ('alias', 'pack', 'staff')),
  PRIMARY KEY (question_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_nqqc_concept ON nexus_qb_question_concepts (concept_id);

ALTER TABLE nexus_concepts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_concepts" ON nexus_concepts;
CREATE POLICY "service_role_concepts" ON nexus_concepts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nexus_concept_prereqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_concept_prereqs" ON nexus_concept_prereqs;
CREATE POLICY "service_role_concept_prereqs" ON nexus_concept_prereqs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE nexus_qb_question_concepts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_qb_question_concepts" ON nexus_qb_question_concepts;
CREATE POLICY "service_role_qb_question_concepts" ON nexus_qb_question_concepts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
