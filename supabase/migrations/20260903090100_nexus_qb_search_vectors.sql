-- ============================================================
-- Question Bank search: weighted vectors across the whole question
-- ============================================================
-- Search read one column, question_text. Everything else a question knows
-- about itself was invisible:
--
--   options            3,930 of 4,129 rows
--   explanations       3,946 rows
--   tags               7,369 links over 94 curated tags
--   nta_question_id    2,115 rows (the official paper id teachers quote)
--
-- Two vectors, not one, because explanations must not be searchable by
-- students: a student hunting a concept would otherwise match the worked
-- solution and see the answer in the result snippet. Splitting the index is
-- what makes that leak impossible rather than merely unlikely; the role
-- picks a column inside the RPC and no caller can name one.
--
--   search_vector_public  question + options + tags   -> students
--   search_vector_full    the above + explanations    -> teachers
--
-- Weights: A question text, B tags/categories/section, C options,
-- D explanations. So a title-ish hit outranks a passing mention in a
-- distractor option, which is the whole point of ranking.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS search_vector_public tsvector,
  ADD COLUMN IF NOT EXISTS search_vector_full   tsvector,
  ADD COLUMN IF NOT EXISTS search_doc_norm      text;

COMMENT ON COLUMN nexus_qb_questions.search_vector_public IS
  'Weighted FTS vector WITHOUT explanations. The only vector a student query may touch.';
COMMENT ON COLUMN nexus_qb_questions.search_vector_full IS
  'Weighted FTS vector INCLUDING explanations. Teacher/admin searches only.';
COMMENT ON COLUMN nexus_qb_questions.search_doc_norm IS
  'Normalized public-safe plain text backing the pg_trgm typo fallback and did-you-mean.';


-- ------------------------------------------------------------
-- Tag text for a question: labels plus every curated alias
-- ------------------------------------------------------------
-- The alias lists are the closest thing the product has to a hand written
-- synonym dictionary (43 of 94 active tags carry them). Folding them into
-- the document is what lets "vanishing point" find a Perspective question
-- whose text never says those words.

CREATE OR REPLACE FUNCTION nexus_qb_tag_text(p_question_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  SELECT coalesce(
    string_agg(
      t.label || ' ' || replace(t.slug, '_', ' ') || ' ' ||
      array_to_string(coalesce(t.aliases, '{}'), ' '),
      ' '
    ),
    ''
  )
  FROM nexus_qb_question_tags qt
  JOIN nexus_qb_tags t ON t.id = qt.tag_id AND t.is_active = true
  WHERE qt.question_id = p_question_id
$fn$;


-- ------------------------------------------------------------
-- The trigger that keeps both vectors current
-- ------------------------------------------------------------
-- These cannot be GENERATED columns the way question_text_norm is: tag text
-- needs a join, which is only STABLE, and Postgres rejects that in a
-- generation expression.
--
-- Each field is indexed under BOTH configs, following the library_videos
-- precedent. 'english' stems, so "parabolas" finds "parabola"; 'simple'
-- keeps tokens verbatim, so the glued math forms the normalizer produces
-- ("y2", "3d") survive the stemmer intact.

CREATE OR REPLACE FUNCTION nexus_qb_refresh_search_vectors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_question text;
  v_meta     text;
  v_options  text;
  v_expl     text;
BEGIN
  v_question := nexus_qb_search_normalize(
    concat_ws(' ', NEW.question_text, NEW.question_text_hi, NEW.nta_question_id));

  v_meta := nexus_qb_search_normalize(
    concat_ws(' ',
      nexus_qb_tag_text(NEW.id),
      array_to_string(coalesce(NEW.categories, '{}'), ' '),
      NEW.section));

  v_options := nexus_qb_search_normalize(nexus_qb_options_text(NEW.options));

  v_expl := nexus_qb_search_normalize(
    concat_ws(' ',
      NEW.explanation_brief, NEW.explanation_detailed,
      NEW.explanation_brief_hi, NEW.explanation_detailed_hi));

  NEW.search_vector_public :=
      setweight(to_tsvector('simple',  v_question), 'A')
   || setweight(to_tsvector('english', v_question), 'A')
   || setweight(to_tsvector('simple',  v_meta),     'B')
   || setweight(to_tsvector('english', v_meta),     'B')
   || setweight(to_tsvector('simple',  v_options),  'C')
   || setweight(to_tsvector('english', v_options),  'C');

  NEW.search_vector_full :=
      NEW.search_vector_public
   || setweight(to_tsvector('simple',  v_expl), 'D')
   || setweight(to_tsvector('english', v_expl), 'D');

  -- Public-safe only: the fuzzy fallback and did-you-mean read this, and
  -- both are reachable by students.
  NEW.search_doc_norm := btrim(concat_ws(' ', v_question, v_meta, v_options));

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_qb_search_vectors ON nexus_qb_questions;
CREATE TRIGGER trg_nexus_qb_search_vectors
  BEFORE INSERT OR UPDATE ON nexus_qb_questions
  FOR EACH ROW EXECUTE FUNCTION nexus_qb_refresh_search_vectors();


-- ------------------------------------------------------------
-- Reindex a question when its TAGS change
-- ------------------------------------------------------------
-- Without this, tag text is never indexed at all. On INSERT the question row
-- is written before its tag links exist, so the BEFORE trigger above reads an
-- empty tag set and stores it. The failure is silent: no error, tags simply
-- never match. Re-touching the parent row re-fires the trigger, which reads
-- the now committed tag rows.

CREATE OR REPLACE FUNCTION nexus_qb_touch_question_for_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE nexus_qb_questions
     SET updated_at = updated_at
   WHERE id = COALESCE(NEW.question_id, OLD.question_id);
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_qb_tags_reindex ON nexus_qb_question_tags;
CREATE TRIGGER trg_nexus_qb_tags_reindex
  AFTER INSERT OR UPDATE OR DELETE ON nexus_qb_question_tags
  FOR EACH ROW EXECUTE FUNCTION nexus_qb_touch_question_for_tags();


-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nexus_qb_search_public
  ON nexus_qb_questions USING gin (search_vector_public);

CREATE INDEX IF NOT EXISTS idx_nexus_qb_search_full
  ON nexus_qb_questions USING gin (search_vector_full);

CREATE INDEX IF NOT EXISTS idx_nexus_qb_search_doc_trgm
  ON nexus_qb_questions USING gin (search_doc_norm gin_trgm_ops);


-- ------------------------------------------------------------
-- Backfill
-- ------------------------------------------------------------
-- Every existing row predates the trigger. Touch them all so it fills both
-- vectors. ~4,100 rows, a second or two.
UPDATE nexus_qb_questions SET updated_at = updated_at;
