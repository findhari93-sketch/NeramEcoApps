-- Per-student attendance counts for the Nexus Students page.
--
-- /api/students used to read every nexus_attendance row for the roster
-- (student_id, attended) and count them in JavaScript. That shipped one row per
-- student per class to the function on every page load, and PostgREST's
-- 1,000-row cap silently cut it short on any classroom with more history than
-- that, so attendance percentages were undercounted. This returns one row per
-- student instead, counted in the database, scoped to the classes of the given
-- classrooms (the route's intent: "attendance in this classroom's classes").
--
-- Read-only, STABLE, SECURITY INVOKER: it reads exactly what the caller could
-- read. Only the service role calls it (the Nexus server), so EXECUTE is granted
-- to service_role alone.

CREATE OR REPLACE FUNCTION public.nexus_attendance_counts(
  p_classroom_ids uuid[],
  p_student_ids   uuid[] DEFAULT NULL
)
RETURNS TABLE (student_id uuid, attended bigint, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT a.student_id,
         count(*) FILTER (WHERE a.attended) AS attended,
         count(*)                           AS total
  FROM nexus_attendance a
  JOIN nexus_scheduled_classes c ON c.id = a.scheduled_class_id
  WHERE c.classroom_id = ANY (p_classroom_ids)
    AND (p_student_ids IS NULL OR a.student_id = ANY (p_student_ids))
  GROUP BY a.student_id
$$;

REVOKE ALL ON FUNCTION public.nexus_attendance_counts(uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nexus_attendance_counts(uuid[], uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_attendance_counts(uuid[], uuid[]) TO service_role;

COMMENT ON FUNCTION public.nexus_attendance_counts(uuid[], uuid[]) IS
  'Per-student attended/total attendance rows within the given classrooms. Used by Nexus /api/students.';

-- Indexes used: idx_nexus_scheduled_classes_classroom (classroom_id) and
-- nexus_attendance_scheduled_class_id_student_id_key, both already present.
