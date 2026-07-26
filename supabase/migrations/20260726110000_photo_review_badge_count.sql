-- Photo review badge count.
--
-- The sidebar badge previously counted every non-alumni user in the tenant with
-- photo_status = 'pending'. That is ~1,400 rows, of which ~1,350 are marketing
-- leads whose avatar arrived automatically from Google sign-in and who will
-- never open Nexus. The badge read "99+" while the review queue, which is scoped
-- to one classroom roster, correctly read 0.
--
-- This function counts exactly the population the queue shows: non-alumni
-- students with an active enrollment in a live, non-archived classroom. DISTINCT
-- because a student enrolled in two live classrooms is still one photo to judge.
--
-- Kept as a function rather than two hand-written PostgREST filters so the badge
-- and the queue cannot drift apart again.

CREATE OR REPLACE FUNCTION public.count_pending_photo_reviews()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(DISTINCT u.id), 0)::integer
  FROM public.users u
  JOIN public.nexus_enrollments e
    ON e.user_id = u.id
   AND e.is_active IS TRUE
   AND e.role = 'student'
  JOIN public.nexus_classrooms c
    ON c.id = e.classroom_id
   AND c.is_active IS NOT FALSE
   AND c.is_archived IS NOT TRUE
  WHERE u.photo_status = 'pending'
    AND u.is_alumni IS NOT TRUE;
$$;

-- Staff-only surface. Nexus calls this with the service role, so no broader
-- grant is needed and anon/authenticated must not be able to probe it.
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews() FROM anon;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_photo_reviews() TO service_role;

COMMENT ON FUNCTION public.count_pending_photo_reviews() IS
  'Number of distinct students with an active enrollment in a live classroom awaiting a profile photo decision. Backs the Nexus staff nav badge.';
