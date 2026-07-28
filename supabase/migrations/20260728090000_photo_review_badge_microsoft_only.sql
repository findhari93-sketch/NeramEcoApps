-- Photo review badge: count only students who can actually sign in to Nexus.
--
-- The queue at /teacher/photo-review now skips enrolled students who have no
-- Microsoft account (ms_oid IS NULL). Those are new joinees who paid through the
-- marketing direct-enrollment link before Entra provisioning: what shows on their
-- card is the Google account picture that arrived with their signup, which they
-- never offered as a face photo, and the photo gate it feeds can never apply to
-- someone who cannot log in.
--
-- This function exists precisely so the badge and the queue cannot drift apart
-- (see 20260726110000_photo_review_badge_count.sql), so it has to learn the same
-- rule. Without this the sidebar would advertise work the queue refuses to show.

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
    AND u.is_alumni IS NOT TRUE
    AND u.ms_oid IS NOT NULL;
$$;

COMMENT ON FUNCTION public.count_pending_photo_reviews() IS
  'Number of distinct students with an active enrollment in a live classroom, a Microsoft account, and a profile photo awaiting a decision. Backs the Nexus staff nav badge and must match the /teacher/photo-review queue.';
