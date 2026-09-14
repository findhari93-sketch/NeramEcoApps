-- Photo review badge: leave out paused (dormant) students.
--
-- Founder rule, 2026-09-13: a paused student appears in no list and no count.
-- The /teacher/photo-review queue (lib/photo-review-roster.ts loadPhotoRoster)
-- now filters participation_status = 'active', so the badge must too, or it
-- counts students the queue no longer shows and becomes unclearable again (the
-- exact drift 20260910090300 was written to end). Everything else is that
-- migration's body, clause for clause.

DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'count_pending_photo_reviews'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END
$drop$;

CREATE OR REPLACE FUNCTION public.count_pending_photo_reviews(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH viewer_classrooms AS (
    SELECT e.classroom_id
    FROM public.nexus_enrollments e
    JOIN public.nexus_classrooms c
      ON c.id = e.classroom_id
     AND c.is_active IS NOT FALSE
     AND c.is_archived IS NOT TRUE
    WHERE e.user_id = p_user_id
      AND e.is_active IS TRUE
  )
  SELECT COALESCE(count(DISTINCT u.id), 0)::integer
  FROM public.nexus_enrollments e
  JOIN viewer_classrooms vc
    ON vc.classroom_id = e.classroom_id
  JOIN public.users u
    ON u.id = e.user_id
  WHERE e.is_active IS TRUE
    AND e.role = 'student'
    AND e.participation_status = 'active'
    AND u.photo_status = 'pending'
    AND u.is_alumni IS NOT TRUE
    AND u.ms_oid IS NOT NULL
    AND u.ms_oid <> '';
$$;

-- Grants do not survive the DROP; a new function defaults to EXECUTE TO PUBLIC.
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_photo_reviews(uuid) TO service_role;

COMMENT ON FUNCTION public.count_pending_photo_reviews(uuid) IS
  'Distinct participating (not dormant) students awaiting a profile photo decision, restricted to the classrooms p_user_id has an active enrollment in. Same population the /teacher/photo-review queue shows that person. Backs the Nexus staff nav badge.';

NOTIFY pgrst, 'reload schema';
