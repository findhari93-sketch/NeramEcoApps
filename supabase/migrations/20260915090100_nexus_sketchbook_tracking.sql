-- Sketchbook truth: when tracking starts, and what counts as a drawing day.
--
-- 1. nexus_classrooms.sketchbook_started_on
--    The Class rhythm screen said "No sketches in 8 weeks" for every student the
--    day after the sketchbook launched, because nothing recorded when it started.
--    A student is judged only from max(this date, their enrolment, their return
--    from dormant). Existing classrooms start on launch day (2026-09-12) or the
--    day they were created, whichever is later. No history is backfilled.
--
-- 2. nexus_drawing_days(student_ids, since)
--    A practice day is any IST day with ANY drawing upload: sketchbook, drawing
--    assignment, question bank or free practice. Computed on read from
--    drawing_submissions rather than stored, because drawings are written in four
--    places and deleted in three; a stored copy would drift. The existing
--    nexus_sketchbook_practice_days table stays as the points ledger only.
--
-- 3. nexus_latest_sketches(student_ids)
--    The newest sketchbook upload per student, for the thumbnail on each row.
--
-- Both functions are service-role only: the routes decide who may see whom.

ALTER TABLE nexus_classrooms ADD COLUMN IF NOT EXISTS sketchbook_started_on date;

UPDATE nexus_classrooms
SET sketchbook_started_on = GREATEST(DATE '2026-09-12', (created_at AT TIME ZONE 'Asia/Kolkata')::date)
WHERE sketchbook_started_on IS NULL;

ALTER TABLE nexus_classrooms
  ALTER COLUMN sketchbook_started_on SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  ALTER COLUMN sketchbook_started_on SET NOT NULL;

COMMENT ON COLUMN nexus_classrooms.sketchbook_started_on IS
  'IST date the sketchbook rhythm starts counting for this classroom. Days before it are never judged.';

CREATE INDEX IF NOT EXISTS idx_ds_student_submitted
  ON drawing_submissions (student_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.nexus_drawing_days(p_student_ids uuid[], p_since date)
RETURNS TABLE (student_id uuid, practice_date date, drawings int, sketches int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ds.student_id,
         (ds.submitted_at AT TIME ZONE 'Asia/Kolkata')::date AS practice_date,
         count(*)::int AS drawings,
         (count(*) FILTER (WHERE ds.source_type = 'sketchbook'))::int AS sketches
  FROM drawing_submissions ds
  WHERE ds.student_id = ANY (p_student_ids)
    AND ds.submitted_at IS NOT NULL
    AND ds.submitted_at >= (p_since::timestamp AT TIME ZONE 'Asia/Kolkata')
  GROUP BY 1, 2
$$;

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
  WHERE ds.source_type = 'sketchbook'
    AND ds.student_id = ANY (p_student_ids)
  ORDER BY ds.student_id, ds.submitted_at DESC
$$;

REVOKE ALL ON FUNCTION public.nexus_drawing_days(uuid[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexus_latest_sketches(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_drawing_days(uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.nexus_latest_sketches(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
