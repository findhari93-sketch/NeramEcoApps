-- ============================================================================
-- Supabase security advisor, 2026-10-15 pull: prod 1 new WARN, staging 0.
--
-- function_search_path_mutable (prod only):
--   nexus_bump_class_video_view   apps/nexus /api/timetable/[classId]/prewatch/
--                                 [resourceId]/progress (getSupabaseAdminClient).
--                                 SECURITY INVOKER, EXECUTE granted to service_role.
--                                 The body only reads and writes public tables
--                                 (nexus_class_resources, nexus_scheduled_classes,
--                                 nexus_enrollments, nexus_class_video_views), so a
--                                 fixed search_path changes nothing it resolves.
--
-- Why prod missed it: 20261120090000_security_advisor_fixes.sql pinned every
-- public function on 2026-10-13, but 20261116090000_nexus_class_prewatch.sql
-- reached prod after that loop ran. Staging had it first, so the loop caught it.
--
-- Same catalog loop as before (recipe R4), so it also catches any other function
-- created since and is a no-op when re-applied.
-- ============================================================================

DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
