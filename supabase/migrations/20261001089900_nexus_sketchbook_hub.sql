-- ============================================
-- SKETCHBOOK HUB: every drawing on its date, practice linked to Inspiration
--
-- Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
-- Additive and idempotent.
-- ============================================

-- "Practise this": the Inspiration drawing a sketch was made from.
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS inspiration_item_id UUID REFERENCES nexus_inspiration_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drawing_submissions_inspiration_item
  ON drawing_submissions (inspiration_item_id)
  WHERE inspiration_item_id IS NOT NULL;

-- The Class rhythm row's thumbnail is the student's latest drawing of any kind,
-- except a test paper, which a classmate may still be about to sit.
CREATE OR REPLACE FUNCTION public.nexus_latest_sketches(p_student_ids uuid[])
RETURNS TABLE (student_id uuid, submission_id uuid, thumbnail_url text, original_image_url text, submitted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ds.student_id)
         ds.student_id, ds.id, ds.thumbnail_url, ds.original_image_url, ds.submitted_at
  FROM drawing_submissions ds
  WHERE ds.source_type <> 'exam'
    AND ds.student_id = ANY (p_student_ids)
  ORDER BY ds.student_id, ds.submitted_at DESC
$$;
REVOKE ALL ON FUNCTION public.nexus_latest_sketches(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_latest_sketches(uuid[]) TO service_role;

-- Attempts drawn from one Inspiration drawing: sketches practised from it, and
-- every other submission to the same drawing question (the historical attempts).
-- Staff see all of them with the review state. A student sees only attempts
-- whose own original is itself visible in Inspiration (4 stars and above, not
-- opted out, not hidden), never a status, rating or mark, and never a
-- submission id. Test drawings never count.
CREATE OR REPLACE FUNCTION nexus_inspiration_attempts(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_staff     boolean,
  p_limit     int DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  WITH seed AS (
    SELECT i.id, i.source_submission_id, i.source_drawing_question_id
      FROM nexus_inspiration_items i
     WHERE i.id = p_item_id
       AND (p_staff OR EXISTS (
             SELECT 1
               FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, 'visible', p_viewer_id, false) v
              WHERE v.id = p_item_id))
  ),
  attempts AS (
    SELECT ds.id, ds.student_id, ds.original_image_url, ds.thumbnail_url, ds.submitted_at, ds.status,
           ds.tutor_rating::real AS tutor_rating, ds.tutor_marks::real AS tutor_marks, ds.reviewed_at,
           (ds.inspiration_item_id IS NOT DISTINCT FROM seed.id) AS practised_from
      FROM seed
      JOIN drawing_submissions ds
        ON ds.source_type <> 'exam'
       AND ds.id IS DISTINCT FROM seed.source_submission_id
       AND (ds.inspiration_item_id = seed.id
            OR (seed.source_drawing_question_id IS NOT NULL
                AND (ds.question_id = seed.source_drawing_question_id
                     OR ds.assignment_id IN (
                          SELECT ca.id FROM nexus_class_assignments ca
                           WHERE ca.drawing_question_id = seed.source_drawing_question_id))))
  ),
  originals AS (
    SELECT b.id AS item_id, b.source_submission_id, b.thumbnail_url AS item_thumb,
           b.author_first_name, b.author_last_name, b.author_name, b.author_is_alumni, b.author_academic_year
      FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, CASE WHEN p_staff THEN 'all' ELSE 'visible' END, p_viewer_id, false) b
     WHERE b.source_kind = 'submission_original'
       AND b.source_submission_id IN (SELECT a.id FROM attempts a)
  ),
  shown AS (
    SELECT a.*, o.item_id, o.item_thumb,
           CASE WHEN p_staff THEN u.first_name ELSE o.author_first_name END AS first_name,
           CASE WHEN p_staff THEN u.last_name ELSE o.author_last_name END AS last_name,
           CASE WHEN p_staff THEN u.name ELSE o.author_name END AS full_name,
           CASE WHEN p_staff THEN coalesce(u.is_alumni, false) ELSE coalesce(o.author_is_alumni, false) END AS is_alumni,
           CASE WHEN p_staff THEN u.academic_year::text ELSE o.author_academic_year END AS academic_year
      FROM attempts a
      LEFT JOIN originals o ON o.source_submission_id = a.id
      LEFT JOIN users u ON u.id = a.student_id
     WHERE p_staff OR o.item_id IS NOT NULL
  ),
  page AS (
    SELECT * FROM shown
     ORDER BY practised_from DESC, submitted_at DESC, id
     LIMIT greatest(1, least(coalesce(p_limit, 24), 60))
  )
  SELECT jsonb_build_object(
           'students', (SELECT count(DISTINCT a.student_id) FROM attempts a),
           'shown', (SELECT count(*) FROM shown),
           'rows', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'submission_id', CASE WHEN p_staff THEN p.id END,
                      'original_item_id', p.item_id,
                      'image_url', p.original_image_url,
                      'thumbnail_url', coalesce(p.item_thumb, p.thumbnail_url),
                      'author_first_name', p.first_name,
                      'author_last_name', p.last_name,
                      'author_name', p.full_name,
                      'author_is_alumni', p.is_alumni,
                      'author_academic_year', p.academic_year,
                      'submitted_at', p.submitted_at,
                      'status', CASE WHEN p_staff THEN p.status END,
                      'tutor_rating', CASE WHEN p_staff THEN p.tutor_rating END,
                      'tutor_marks', CASE WHEN p_staff THEN p.tutor_marks END,
                      'reviewed_at', CASE WHEN p_staff THEN p.reviewed_at END,
                      'practised_from', p.practised_from)
                    ORDER BY p.practised_from DESC, p.submitted_at DESC, p.id)
               FROM page p), '[]'::jsonb))
  WHERE EXISTS (SELECT 1 FROM seed)
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_attempts(uuid, uuid, boolean, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_attempts(uuid, uuid, boolean, int) TO service_role;

NOTIFY pgrst, 'reload schema';
