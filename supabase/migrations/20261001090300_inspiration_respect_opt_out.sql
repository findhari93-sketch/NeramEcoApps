-- Two ways a student's drawing reached the public Inspiration page without them
-- having agreed to it.
--
-- 1. share_drawings_opt_out only covered 'submission_original'.
--
--    A submission makes two Inspiration items: the student's drawing, and, when
--    a teacher leaves one, the teacher's corrected version of the same drawing.
--    The opt-out hid the first and not the second, so a student who asked for
--    their drawings not to be shared still had a marked-up copy of one on the
--    public page. Their name was already blanked, which made it look handled;
--    the picture is the part that identifies the work.
--
--    nexus_inspiration_base is the one place to change it: search, facets,
--    similar and get all read through it.
--
--    This hides nothing today. No student has opted out yet. It matters the
--    first time one does.
--
-- 2. A correction was auto-published with no quality bar at all.
--
--    The original needs a review AND a score of 80% or better. The corrected
--    version needs only a review. A sketch is stored status 'completed' from the
--    moment it is uploaded, so the first teacher to mark up a sketch would have
--    published a teenager's private daily practice, at any standard, the instant
--    they saved it.
--
--    A guard trigger rather than a re-emission of the 200-line sync function:
--    the rule then holds whatever writes the row, and the next person to edit
--    that function cannot lose it. A teacher can still put a sketch in
--    Inspiration deliberately, by featuring it, which sets curation = 'shown'
--    and is not touched here.
--
--    This hides nothing today either: no sketch has a corrected image yet, and
--    the 155 visible question bank and free practice references are untouched.

CREATE OR REPLACE FUNCTION nexus_inspiration_base(
  p_types      text[],
  p_exam       text,
  p_by         text,
  p_year       smallint,
  p_scope      text,
  p_viewer_id  uuid,
  p_saved_only boolean
)
RETURNS TABLE (
  id uuid, source_kind text, source_submission_id uuid, source_drawing_question_id uuid,
  image_url text, thumbnail_url text, image_aspect real, title_override text, brief text,
  category text, type_slugs text[], tag_labels text[], exam_types text[], paper_years smallint[],
  is_featured boolean, is_visible boolean, curation text, auto_eligible boolean, score_pct real,
  save_count integer, source_created_at timestamptz, search_vector tsvector, search_text_norm text,
  author_id uuid, author_name text, author_first_name text, author_last_name text,
  author_is_alumni boolean, author_academic_year text, author_opted_out boolean, is_saved boolean
)
LANGUAGE sql
STABLE
AS $fn$
  WITH item_rows AS (
    SELECT i.*,
           coalesce(u.share_drawings_opt_out, false) AS opted_out,
           u.name AS u_name, u.first_name AS u_first, u.last_name AS u_last,
           coalesce(u.is_alumni, false) AS u_alumni, u.academic_year AS u_year,
           (i.is_visible AND NOT (i.source_kind IN ('submission_original', 'submission_reference')
                                  AND coalesce(u.share_drawings_opt_out, false))) AS student_visible
      FROM nexus_inspiration_items i
      LEFT JOIN users u ON u.id = i.author_id
  )
  SELECT r.id, r.source_kind, r.source_submission_id, r.source_drawing_question_id,
         r.image_url, r.thumbnail_url, r.image_aspect, r.title_override, coalesce(r.brief_override, r.brief),
         r.category, r.type_slugs, r.tag_labels, r.exam_types, r.paper_years,
         r.is_featured, r.student_visible, r.curation, r.auto_eligible, r.score_pct,
         r.save_count, r.source_created_at, r.search_vector, r.search_text_norm,
         CASE WHEN r.opted_out THEN NULL ELSE r.author_id END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_name END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_first END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_last END,
         CASE WHEN r.opted_out THEN false ELSE r.u_alumni END,
         CASE WHEN r.opted_out THEN NULL ELSE r.u_year END,
         r.opted_out,
         EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id)
    FROM item_rows r
   WHERE (CASE coalesce(p_scope, 'visible')
            WHEN 'all' THEN true
            WHEN 'hidden' THEN NOT r.student_visible
                           AND (r.curation = 'hidden' OR r.score_pct IS NOT NULL OR r.source_kind <> 'submission_original')
            ELSE r.student_visible
          END)
     AND (p_types IS NULL OR cardinality(p_types) = 0 OR r.type_slugs && p_types)
     AND (p_exam IS NULL OR p_exam = ANY(r.exam_types))
     AND (p_year IS NULL OR p_year = ANY(r.paper_years))
     AND (p_by IS NULL
          OR (p_by = 'reference' AND r.source_kind <> 'submission_original')
          OR (p_by = 'current'   AND r.source_kind = 'submission_original' AND NOT r.u_alumni)
          OR (p_by = 'alumni'    AND r.source_kind = 'submission_original' AND r.u_alumni))
     AND (NOT coalesce(p_saved_only, false)
          OR EXISTS (SELECT 1 FROM nexus_inspiration_saves sv WHERE sv.item_id = r.id AND sv.user_id = p_viewer_id))
$fn$;


CREATE OR REPLACE FUNCTION nexus_inspiration_no_auto_publish_of_practice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.source_kind = 'submission_reference'
     AND NEW.auto_eligible
     AND EXISTS (
       SELECT 1 FROM drawing_submissions d
        WHERE d.id = NEW.source_submission_id
          AND d.source_type = 'sketchbook'
     )
  THEN
    -- Curation is the teacher's decision and is left alone; only the automatic
    -- route is closed.
    NEW.auto_eligible := false;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_nexus_inspiration_no_auto_practice ON nexus_inspiration_items;
CREATE TRIGGER trg_nexus_inspiration_no_auto_practice
  BEFORE INSERT OR UPDATE OF auto_eligible, source_kind, source_submission_id
  ON nexus_inspiration_items
  FOR EACH ROW
  EXECUTE FUNCTION nexus_inspiration_no_auto_publish_of_practice();

-- Any sketch correction already auto-published before this trigger existed.
UPDATE nexus_inspiration_items i
   SET auto_eligible = false
  FROM drawing_submissions d
 WHERE d.id = i.source_submission_id
   AND i.source_kind = 'submission_reference'
   AND i.auto_eligible
   AND i.curation = 'auto'
   AND d.source_type = 'sketchbook';

NOTIFY pgrst, 'reload schema';
