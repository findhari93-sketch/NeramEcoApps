-- ============================================
-- INSPIRATION SYNC: drawing_submissions -> nexus_inspiration_items
--
-- Triggers, not app code: at least nine routes write the columns that decide
-- what a student may see (review, release, redo, gallery publish, sketchbook
-- feature, rotate, tags, auto-draft tags, delete). One function that
-- recomputes a submission's items from scratch catches all of them and cannot
-- drift. It never writes curation columns, and it swallows its own errors so
-- a sync problem can never fail a teacher's review save.
--
-- Rule (mirrored in apps/nexus/src/lib/inspiration-rules.ts):
--   reference eligible  reviewed_at set, status completed/reviewed/redo
--   original eligible   reviewed_at set, status completed/reviewed, score >= 0.8
--   score               a 'marks' assignment: tutor_marks / max_marks; else
--                       tutor_rating / 5; else tutor_marks / max_marks
--   exam drawings       never become items
--
-- Not copied from the submission, on purpose:
--   self_note           a student's private reflection; the brief is the
--                       question text, else the assignment title, else NULL
--   thumbnail, aspect   the submission's may predate a rotation; an item
--                       starts with NULL and keeps its own only while
--                       image_url is unchanged (maintenance measures it)
--   is_featured         alumni_featured seeds it on INSERT only, so a
--                       re-sync never undoes a teacher's un-feature
-- ============================================

-- Drawing tags and question sub-types use their own spellings. Map them onto
-- the nexus_qb_tags drawing tree so one set of type chips covers everything.
CREATE OR REPLACE FUNCTION nexus_inspiration_type_slug(p_raw text)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
  WITH norm AS (SELECT replace(lower(btrim(coalesce(p_raw, ''))), '-', '_') AS s),
  mapped AS (
    SELECT CASE n.s
      WHEN 'perspective'      THEN 'perspective_drawing'
      WHEN 'portrait'         THEN 'portrait_figure'
      WHEN 'figure_study'     THEN 'portrait_figure'
      WHEN 'logo'             THEN 'logo_design'
      WHEN 'poster'           THEN 'poster_design'
      WHEN 'geometric_shapes' THEN 'shape_composition'
      WHEN 'product_surface'  THEN 'product_object'
      ELSE n.s
    END AS s
    FROM norm n
  ),
  drawing_root AS (SELECT id FROM nexus_qb_tags WHERE slug = 'drawing' LIMIT 1)
  SELECT c.slug
    FROM mapped m
    JOIN nexus_qb_tags c ON c.slug = m.s AND c.is_active
   WHERE m.s <> ''
     AND (c.parent_id = (SELECT id FROM drawing_root)
          OR c.parent_id IN (SELECT t.id FROM nexus_qb_tags t WHERE t.parent_id = (SELECT id FROM drawing_root)))
   LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_sync_submission(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  s              drawing_submissions%ROWTYPE;
  v_q_id         uuid;
  v_q_text       text;
  v_q_category   text;
  v_q_sub_type   text;
  v_q_year       integer;
  v_qb_id        uuid;
  v_max_marks    numeric;
  v_assign_title text;
  v_evaluation_type text;
  v_brief        text;
  v_types        text[];
  v_labels       text[];
  v_exams        text[];
  v_years        smallint[];
  v_score_num    numeric;
  v_reviewed     boolean;
BEGIN
  SELECT * INTO s FROM drawing_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- A classmate may be about to sit the same paper.
  IF s.source_type = 'exam' THEN
    DELETE FROM nexus_inspiration_items WHERE source_submission_id = s.id;
    RETURN;
  END IF;

  SELECT ca.max_marks, ca.title, ca.drawing_question_id, ca.evaluation_type
    INTO v_max_marks, v_assign_title, v_q_id, v_evaluation_type
    FROM nexus_class_assignments ca
   WHERE ca.id = s.assignment_id;

  SELECT dq.id, dq.question_text, dq.category, dq.sub_type, dq.year, dq.qb_question_id
    INTO v_q_id, v_q_text, v_q_category, v_q_sub_type, v_q_year, v_qb_id
    FROM drawing_questions dq
   WHERE dq.id = coalesce(s.question_id, v_q_id);

  -- Never self_note: that is the student's private reflection.
  v_brief := coalesce(nullif(btrim(v_q_text), ''), nullif(btrim(v_assign_title), ''));

  -- A marks assignment scores by marks even when a rating was also left; a
  -- stars assignment (or free practice) falls back to stars, then to marks.
  v_score_num := CASE
    WHEN v_evaluation_type = 'marks' AND s.tutor_marks IS NOT NULL AND v_max_marks > 0 THEN s.tutor_marks / v_max_marks
    WHEN s.tutor_rating IS NOT NULL THEN s.tutor_rating / 5.0
    WHEN s.tutor_marks IS NOT NULL AND v_max_marks > 0 THEN s.tutor_marks / v_max_marks
  END;

  SELECT coalesce(array_agg(DISTINCT CASE WHEN src.exam_type ILIKE 'JEE%' THEN 'JEE_PAPER_2' ELSE 'NATA' END)
                    FILTER (WHERE src.exam_type IS NOT NULL), '{}'),
         coalesce(array_agg(DISTINCT src.year::smallint) FILTER (WHERE src.year IS NOT NULL), '{}')
    INTO v_exams, v_years
    FROM nexus_qb_question_sources src
   WHERE src.question_id = v_qb_id;

  IF cardinality(v_exams) = 0 AND v_qb_id IS NOT NULL THEN
    SELECT CASE q.exam_relevance
             WHEN 'JEE'  THEN ARRAY['JEE_PAPER_2']
             WHEN 'NATA' THEN ARRAY['NATA']
             WHEN 'BOTH' THEN ARRAY['NATA', 'JEE_PAPER_2']
           END
      INTO v_exams
      FROM nexus_qb_questions q
     WHERE q.id = v_qb_id;
    v_exams := coalesce(v_exams, '{}');
  END IF;

  -- An assignment brief's hidden question carries the year it was written,
  -- not a past paper year, so only real practice questions lend their year.
  IF cardinality(v_years) = 0 AND v_q_year IS NOT NULL AND coalesce(v_q_sub_type, '') <> 'assignment' THEN
    v_years := ARRAY[v_q_year::smallint];
  END IF;

  v_types := ARRAY(
    SELECT DISTINCT m.slug FROM (
      SELECT nexus_inspiration_type_slug(dt.slug) AS slug
        FROM drawing_submission_tags st
        JOIN drawing_tags dt ON dt.id = st.tag_id
       WHERE st.submission_id = s.id
      UNION ALL SELECT nexus_inspiration_type_slug(v_q_category)
      UNION ALL SELECT nexus_inspiration_type_slug(v_q_sub_type)
    ) m
    WHERE m.slug IS NOT NULL);

  -- A leaf type ("Street View") also files under its family ("2D Composition").
  v_types := ARRAY(
    SELECT DISTINCT x.slug FROM (
      SELECT unnest(v_types) AS slug
      UNION ALL
      SELECT p.slug
        FROM nexus_qb_tags c
        JOIN nexus_qb_tags p ON p.id = c.parent_id
       WHERE c.slug = ANY(v_types) AND p.slug <> 'drawing'
    ) x
    ORDER BY x.slug);

  v_labels := ARRAY(
    SELECT DISTINCT l.label FROM (
      SELECT dt.label AS label
        FROM drawing_submission_tags st
        JOIN drawing_tags dt ON dt.id = st.tag_id
       WHERE st.submission_id = s.id
         AND dt.slug NOT LIKE 'e2e-%'
         AND nexus_inspiration_type_slug(dt.slug) IS NULL
      UNION ALL
      SELECT initcap(replace(v_q_sub_type, '_', ' '))
       WHERE v_q_sub_type IS NOT NULL
         AND v_q_sub_type <> 'assignment'
         AND nexus_inspiration_type_slug(v_q_sub_type) IS NULL
    ) l
    WHERE l.label IS NOT NULL
    ORDER BY l.label);

  v_reviewed := s.reviewed_at IS NOT NULL;

  -- The submission's thumbnail_url and image_quality.aspect are never
  -- recomputed after a rotation (auto or manual), so neither is trusted here.
  -- The item starts with NULL, and the maintenance batch measures the image
  -- it actually shows. A new image_url throws the item's own values away.
  -- is_featured is seeded from the Hall of Fame on INSERT only.
  INSERT INTO nexus_inspiration_items AS i (
    source_kind, source_submission_id, source_drawing_question_id, source_qb_question_id,
    image_url, thumbnail_url, image_aspect, brief, category, type_slugs, tag_labels,
    exam_types, paper_years, author_id, score_pct, source_created_at, auto_eligible, is_featured)
  VALUES (
    'submission_original', s.id, v_q_id, v_qb_id,
    s.original_image_url, NULL, NULL, v_brief, v_q_category, v_types, v_labels,
    v_exams, v_years, s.student_id, v_score_num::real, coalesce(s.submitted_at, now()),
    v_reviewed AND s.status IN ('completed', 'reviewed') AND coalesce(v_score_num, 0) >= 0.8,
    coalesce(s.alumni_featured, false))
  ON CONFLICT (source_kind, source_submission_id) WHERE source_submission_id IS NOT NULL
  DO UPDATE SET
    source_drawing_question_id = EXCLUDED.source_drawing_question_id,
    source_qb_question_id      = EXCLUDED.source_qb_question_id,
    thumbnail_url = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.thumbnail_url ELSE NULL END,
    image_aspect  = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.image_aspect ELSE NULL END,
    image_url         = EXCLUDED.image_url,
    brief             = EXCLUDED.brief,
    category          = EXCLUDED.category,
    type_slugs        = EXCLUDED.type_slugs,
    tag_labels        = EXCLUDED.tag_labels,
    exam_types        = EXCLUDED.exam_types,
    paper_years       = EXCLUDED.paper_years,
    author_id         = EXCLUDED.author_id,
    score_pct         = EXCLUDED.score_pct,
    source_created_at = EXCLUDED.source_created_at,
    auto_eligible     = EXCLUDED.auto_eligible;

  IF s.corrected_image_url IS NOT NULL THEN
    INSERT INTO nexus_inspiration_items AS i (
      source_kind, source_submission_id, source_drawing_question_id, source_qb_question_id,
      image_url, thumbnail_url, image_aspect, brief, category, type_slugs, tag_labels,
      exam_types, paper_years, author_id, score_pct, source_created_at, auto_eligible, is_featured)
    VALUES (
      'submission_reference', s.id, v_q_id, v_qb_id,
      s.corrected_image_url, NULL, NULL, v_brief, v_q_category, v_types, v_labels,
      v_exams, v_years, s.student_id, NULL, coalesce(s.reviewed_at, s.submitted_at, now()),
      v_reviewed AND s.status IN ('completed', 'reviewed', 'redo'),
      coalesce(s.alumni_featured, false))
    ON CONFLICT (source_kind, source_submission_id) WHERE source_submission_id IS NOT NULL
    DO UPDATE SET
      source_drawing_question_id = EXCLUDED.source_drawing_question_id,
      source_qb_question_id      = EXCLUDED.source_qb_question_id,
      thumbnail_url = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.thumbnail_url ELSE NULL END,
      image_aspect  = CASE WHEN i.image_url = EXCLUDED.image_url THEN i.image_aspect ELSE NULL END,
      image_url         = EXCLUDED.image_url,
      brief             = EXCLUDED.brief,
      category          = EXCLUDED.category,
      type_slugs        = EXCLUDED.type_slugs,
      tag_labels        = EXCLUDED.tag_labels,
      exam_types        = EXCLUDED.exam_types,
      paper_years       = EXCLUDED.paper_years,
      author_id         = EXCLUDED.author_id,
      source_created_at = EXCLUDED.source_created_at,
      auto_eligible     = EXCLUDED.auto_eligible;
  ELSE
    -- Keep the row (saves and curation survive); just take it off the shelf.
    UPDATE nexus_inspiration_items
       SET auto_eligible = false
     WHERE source_kind = 'submission_reference'
       AND source_submission_id = s.id
       AND auto_eligible;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'nexus_inspiration_sync_submission(%): % %', p_submission_id, SQLSTATE, SQLERRM;
END;
$fn$;

CREATE OR REPLACE FUNCTION nexus_inspiration_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM nexus_inspiration_sync_submission(NEW.id);
  RETURN NULL;
END;
$fn$;

-- Only the columns the sync reads. self_note, thumbnail_url, image_quality and
-- auto_rotated_deg feed no item column (a rotation writes original_image_url).
DROP TRIGGER IF EXISTS trg_nexus_inspiration_submission ON drawing_submissions;
CREATE TRIGGER trg_nexus_inspiration_submission
  AFTER INSERT OR UPDATE OF status, reviewed_at, tutor_rating, tutor_marks, corrected_image_url,
    original_image_url, question_id, assignment_id, source_type
  ON drawing_submissions
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_submission();

CREATE OR REPLACE FUNCTION nexus_inspiration_on_submission_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM nexus_inspiration_sync_submission(COALESCE(NEW.submission_id, OLD.submission_id));
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_submission_tag ON drawing_submission_tags;
CREATE TRIGGER trg_nexus_inspiration_submission_tag
  AFTER INSERT OR UPDATE OR DELETE ON drawing_submission_tags
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_submission_tag();

CREATE OR REPLACE FUNCTION nexus_inspiration_on_question()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ds.id
      FROM drawing_submissions ds
     WHERE ds.question_id = NEW.id
        OR ds.assignment_id IN (SELECT ca.id FROM nexus_class_assignments ca WHERE ca.drawing_question_id = NEW.id)
  LOOP
    PERFORM nexus_inspiration_sync_submission(r.id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_question ON drawing_questions;
CREATE TRIGGER trg_nexus_inspiration_question
  AFTER UPDATE OF question_text, category, sub_type, year, qb_question_id ON drawing_questions
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_question();

-- An assignment carries max_marks, title and evaluation_type into every one of
-- its submissions' items, so an edit to the assignment must re-sync them too.
CREATE OR REPLACE FUNCTION nexus_inspiration_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ds.id FROM drawing_submissions ds WHERE ds.assignment_id = NEW.id
  LOOP
    PERFORM nexus_inspiration_sync_submission(r.id);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_assignment ON nexus_class_assignments;
CREATE TRIGGER trg_nexus_inspiration_assignment
  AFTER UPDATE OF max_marks, title, drawing_question_id, evaluation_type ON nexus_class_assignments
  FOR EACH ROW EXECUTE FUNCTION nexus_inspiration_on_assignment();

-- Repair: re-derive every item. Also the backfill below.
CREATE OR REPLACE FUNCTION nexus_inspiration_resync_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT id FROM drawing_submissions LOOP
    PERFORM nexus_inspiration_sync_submission(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_sync_submission(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION nexus_inspiration_resync_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_sync_submission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION nexus_inspiration_resync_all() TO service_role;

-- Backfill. The old is_gallery_visible flag is deliberately ignored: it was set
-- by a default, not by a teacher, and the new rule is the 4 star threshold.
-- Alumni work curators pinned in the Hall of Fame arrives featured (INSERT
-- only), so re-running this file never re-features what a teacher un-featured.
SELECT nexus_inspiration_resync_all();
