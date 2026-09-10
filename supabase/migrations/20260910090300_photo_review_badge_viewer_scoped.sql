-- Photo review badge: count only what the person looking at it can open.
--
-- The badge and the queue counted different populations. The badge called
-- count_pending_photo_reviews(), which swept EVERY live classroom in the tenant
-- with no reference to the caller. The queue at /teacher/photo-review loads ONE
-- classroom (loadRoster in app/api/photo-review/route.ts), and the dropdown that
-- picks it only offers the signed-in person's own classrooms (/api/auth/me ->
-- classrooms). So a teacher could clear every classroom they can reach and the
-- badge would still read 1, forever, because the pending student was in someone
-- else's classroom. A badge you cannot clear is worse than no badge.
--
-- Reproduced on staging, 2026-09-10: two live classrooms, one pending student in
-- "E2E Test Classroom", Haribabu@neramclasses.com enrolled only in "JEE B.Arch
-- Session 1". Badge 1, queue 0, and nothing he could do about it.
--
-- ANY enrollment role for the viewer, deliberately not role = 'teacher':
-- /api/auth/me does NOT filter by role when it builds `classrooms`, so filtering
-- here would re-open the same gap in the other direction, a classroom sitting in
-- the dropdown that the badge ignores. Matching auth/me exactly is the point.
--
-- Staff with no live enrollment get 0. That is correct, not a regression: their
-- dropdown is empty and the queue never loads a roster for them at all.
--
-- The student-side predicate is now identical to the queue's, clause for clause
-- (lib/photo-roster.ts isPhotoReviewable + loadRoster):
--   active student enrollment  ->  nexus_enrollments.role='student', is_active
--   not alumni                 ->  users.is_alumni IS NOT TRUE
--   can actually sign in       ->  users.ms_oid IS NOT NULL AND ms_oid <> ''
-- The `<> ''` is what hasMicrosoftAccount's `!!msOid` has always meant in
-- TypeScript and what a bare IS NOT NULL did not.
--
-- Classroom liveness is applied ONCE, in the viewer CTE. The student's
-- enrollment and the viewer's enrollment are on the same classroom_id, so one
-- filter covers both sides and there is only one copy of the rule to keep true.
--
-- Production is STILL running the original 20260726110000 body: 20260728090000,
-- which added the ms_oid rule, never reached it (verified with
-- pg_get_functiondef). So this file is written to be correct regardless of which
-- earlier version is live.

-- Drop every existing overload by name first. CREATE OR REPLACE cannot change a
-- signature, so adding a parameter would otherwise leave the old zero-argument
-- version in place, and a tenant-wide count would stay one forgotten argument
-- away. Same pattern as 20260903090200_nexus_qb_search_rpc.sql.
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
    -- Exactly the set /api/auth/me hands the classroom dropdown: this person's
    -- active enrollments, in classrooms that are neither disabled nor archived.
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
    AND u.photo_status = 'pending'
    AND u.is_alumni IS NOT TRUE
    AND u.ms_oid IS NOT NULL
    AND u.ms_oid <> '';
$$;

-- MANDATORY, not housekeeping. The REVOKEs on the old function do not survive a
-- DROP: a newly created function defaults to EXECUTE TO PUBLIC. This one is
-- SECURITY DEFINER and now takes an arbitrary p_user_id, so without these lines
-- any authenticated JWT could probe any staff member's classroom workload.
-- Nexus calls it with the service role, so no broader grant is needed.
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.count_pending_photo_reviews(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_photo_reviews(uuid) TO service_role;

COMMENT ON FUNCTION public.count_pending_photo_reviews(uuid) IS
  'Distinct students awaiting a profile photo decision, restricted to the classrooms p_user_id has an active enrollment in. Same population the /teacher/photo-review queue shows that person, so the badge is always clearable by whoever is looking at it. Backs the Nexus staff nav badge.';

-- The signature changed, so PostgREST must re-read the schema or the route gets
-- PGRST202 "Could not find the function ... (p_user_id)". Supabase's event
-- trigger normally does this; saying it explicitly costs nothing.
NOTIFY pgrst, 'reload schema';
