-- ============================================
-- INSPIRATION: the drawing library students search for ideas
--
-- One row per IMAGE, not per submission: a reviewed drawing can give a
-- teacher reference (corrected_image_url) and the student's own original,
-- and each is its own tile, its own save and its own curation.
--
-- Content columns are written by nexus_inspiration_sync_submission (next
-- migration). Curation columns (curation, is_featured, *_override) are only
-- ever written by teachers, so a re-sync never undoes a teacher's decision.
-- Who the author is, whether they graduated and whether they opted out are
-- joined from users at read time, so those changes apply instantly.
--
-- Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
-- Additive and idempotent.
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS nexus_inspiration_items (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind                TEXT NOT NULL CHECK (source_kind IN ('submission_reference', 'submission_original', 'exemplar', 'qb_solution')),
  source_submission_id       UUID REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  source_drawing_question_id UUID REFERENCES drawing_questions(id) ON DELETE SET NULL,
  source_qb_question_id      UUID REFERENCES nexus_qb_questions(id) ON DELETE SET NULL,

  image_url                  TEXT NOT NULL,
  thumbnail_url              TEXT,
  image_aspect               REAL CHECK (image_aspect IS NULL OR image_aspect BETWEEN 0.1 AND 10),

  brief                      TEXT,
  category                   TEXT,
  type_slugs                 TEXT[] NOT NULL DEFAULT '{}',
  tag_labels                 TEXT[] NOT NULL DEFAULT '{}',
  exam_types                 TEXT[] NOT NULL DEFAULT '{}',
  paper_years                SMALLINT[] NOT NULL DEFAULT '{}',
  author_id                  UUID REFERENCES users(id) ON DELETE SET NULL,
  score_pct                  REAL,
  source_created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_eligible              BOOLEAN NOT NULL DEFAULT false,

  curation                   TEXT NOT NULL DEFAULT 'auto' CHECK (curation IN ('auto', 'shown', 'hidden')),
  curated_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  curated_at                 TIMESTAMPTZ,
  is_featured                BOOLEAN NOT NULL DEFAULT false,
  title_override             TEXT,
  brief_override             TEXT,
  created_by                 UUID REFERENCES users(id) ON DELETE SET NULL,

  is_visible                 BOOLEAN GENERATED ALWAYS AS (curation = 'shown' OR (curation = 'auto' AND auto_eligible)) STORED,
  save_count                 INTEGER NOT NULL DEFAULT 0,
  search_vector              TSVECTOR,
  search_text_norm           TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_inspiration_items_source_shape CHECK (
       (source_kind IN ('submission_reference', 'submission_original') AND source_submission_id IS NOT NULL)
    OR (source_kind = 'exemplar' AND source_submission_id IS NULL)
    OR (source_kind = 'qb_solution' AND source_qb_question_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_inspiration_items_submission
  ON nexus_inspiration_items (source_kind, source_submission_id)
  WHERE source_submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_visible_recent
  ON nexus_inspiration_items (is_visible, source_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_search
  ON nexus_inspiration_items USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_trgm
  ON nexus_inspiration_items USING gin (search_text_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_types
  ON nexus_inspiration_items USING gin (type_slugs);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_author
  ON nexus_inspiration_items (author_id);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_items_question
  ON nexus_inspiration_items (source_drawing_question_id);

-- Weighted like library_videos: A = title, drawing types (with their aliases)
-- and tags; B = exam, year, category; C = the brief. Both 'simple' (keeps "3d"
-- and "2025" verbatim) and 'english' (stems "sketches" to "sketch").
CREATE OR REPLACE FUNCTION nexus_inspiration_refresh_search()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_title text := coalesce(NEW.title_override, '');
  v_brief text := coalesce(NEW.brief_override, NEW.brief, '');
  v_types text := coalesce((
    SELECT string_agg(t.label || ' ' || replace(t.slug, '_', ' ') || ' ' || array_to_string(coalesce(t.aliases, '{}'), ' '), ' ')
      FROM nexus_qb_tags t
     WHERE t.slug = ANY(NEW.type_slugs)
  ), '');
  v_head text;
  v_meta text;
BEGIN
  v_head := concat_ws(' ', v_title, v_types, array_to_string(NEW.tag_labels, ' '));
  v_meta := concat_ws(' ',
    CASE WHEN 'NATA' = ANY(NEW.exam_types) THEN 'NATA' END,
    CASE WHEN 'JEE_PAPER_2' = ANY(NEW.exam_types) THEN 'JEE Paper 2 BArch' END,
    array_to_string(NEW.paper_years, ' '),
    replace(coalesce(NEW.category, ''), '_', ' '),
    CASE WHEN NEW.source_kind <> 'submission_original' THEN 'reference' END);

  NEW.search_vector :=
       setweight(to_tsvector('simple',  v_head),  'A')
    || setweight(to_tsvector('english', v_head),  'A')
    || setweight(to_tsvector('simple',  v_meta),  'B')
    || setweight(to_tsvector('english', v_meta),  'B')
    || setweight(to_tsvector('simple',  v_brief), 'C')
    || setweight(to_tsvector('english', v_brief), 'C');
  NEW.search_text_norm := nexus_qb_normalize(concat_ws(' ', v_head, v_brief));
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- Only the columns the search text is built from (and the updated_at those
-- edits stamp). A save, a curation flip or a thumbnail write leaves the
-- search vector alone instead of rebuilding it.
DROP TRIGGER IF EXISTS trg_nexus_inspiration_refresh_search ON nexus_inspiration_items;
CREATE TRIGGER trg_nexus_inspiration_refresh_search
  BEFORE INSERT OR UPDATE OF title_override, brief, brief_override, category, type_slugs, tag_labels,
    exam_types, paper_years, source_kind
  ON nexus_inspiration_items
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_refresh_search();

CREATE TABLE IF NOT EXISTS nexus_inspiration_saves (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES nexus_inspiration_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_saves_user
  ON nexus_inspiration_saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_inspiration_saves_item
  ON nexus_inspiration_saves (item_id);

CREATE OR REPLACE FUNCTION nexus_inspiration_count_saves()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE nexus_inspiration_items SET save_count = save_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE nexus_inspiration_items SET save_count = greatest(save_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_count_saves ON nexus_inspiration_saves;
CREATE TRIGGER trg_nexus_inspiration_count_saves
  AFTER INSERT OR DELETE ON nexus_inspiration_saves
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_count_saves();

-- A student may keep their drawings to themselves. Separate from
-- sketchbook_feature_opt_out, which is about Teams class posts.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS share_drawings_opt_out BOOLEAN NOT NULL DEFAULT false;

-- Service role only. MSAL means auth.uid() is always null in Nexus, so a
-- policy would be dead code; API routes read through the admin client.
ALTER TABLE nexus_inspiration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_inspiration_saves ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
