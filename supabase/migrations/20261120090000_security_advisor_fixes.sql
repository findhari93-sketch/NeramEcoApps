-- ============================================================================
-- Clears the Supabase security advisor backlog (2026-10-13 pull: prod 15 ERROR,
-- staging 15 ERROR, plus SECURITY DEFINER grants and mutable search_path WARNs).
-- Written so the same file applies to prod and to staging despite drift.
--
-- 1. RLS on, anon/authenticated revoked. Every caller uses the service role:
--      drawing_notifications   app + nexus /api/drawing/notifications (admin client)
--      user_saved_colleges     app + marketing /api/colleges/saved (createAdminClient)
--      ask_seniors_events      queries/ask-seniors.ts (createAdminClientISR), admin API
--      alumni_profiles         queries/alumni.ts (admin default, no caller passes another)
--      student_documents       queries/alumni.ts, admin review-requests API
--      nexus_test_draws        queries/nexus/test-repository.ts, test-analytics.ts (admin)
--      nexus_test_imports      apps/nexus/src/lib/test-import-store.ts (adminDb)
--      keam_colleges, keam_allotments, keam_seat_types
--                              only read through the keam_cutoffs view (admin client)
--    No realtime subscriptions on any of them.
--
-- 2. Views switched to security_invoker, anon/authenticated revoked. Readers:
--      auth_funnel_summary     queries/funnel-events.ts (admin)
--      keam_cutoffs            apps/app tools loaders + counseling route (admin)
--      admin_student_activity  queries/crm.ts, queries/alumni.ts (admin)
--      _user_ref_columns       only the service-role merge functions; reads pg_catalog
--      v_josaa_latest_cr       no reader in the repo
--
-- 3. SECURITY DEFINER functions limited to the service role:
--      public_review_stats     marketing review-stats.ts (createAdminClientISR)
--      nexus_enrollment_not_started, nexus_enrollment_not_started_audit,
--      nexus_inspiration_on_assignment, _on_question, _on_submission,
--      _on_submission_tag      trigger functions only. EXECUTE is checked when a
--                              trigger is created, not when it fires.
--      Staging-only leftovers with no definition or caller in the repo:
--      cleanup_old_sessions, create_notification, end_user_session,
--      get_active_sessions, get_user_session_stats, log_session_event,
--      start_user_session, update_session_section, notify_application_submitted,
--      notify_payment_update, notify_profile_update, notify_user_registered
--    Left open on purpose: check_username_available and suggest_usernames
--    (apps/app /api/auth/check-username uses the anon client). They still get a
--    fixed search_path below.
--
-- 4. coa_state_stats materialized view: anon/authenticated revoked. getCOAStats
--    has no caller.
--
-- 5. search_path pinned on every public function that has none (excluding
--    extension-owned functions such as pg_trgm's). extensions stays in the path
--    for pgcrypto and uuid-ossp. Checked 2026-10-13: no flagged function calls
--    an extension function by bare name.
-- ============================================================================

-- 1. Tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drawing_notifications',
    'user_saved_colleges',
    'ask_seniors_events',
    'alumni_profiles',
    'student_documents',
    'nexus_test_draws',
    'nexus_test_imports',
    'keam_colleges',
    'keam_allotments',
    'keam_seat_types'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- 2. Views
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'auth_funnel_summary',
    'keam_cutoffs',
    'admin_student_activity',
    '_user_ref_columns',
    'v_josaa_latest_cr'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
    END IF;
  END LOOP;
END $$;

-- 3. SECURITY DEFINER functions
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'public_review_stats',
        'nexus_enrollment_not_started',
        'nexus_enrollment_not_started_audit',
        'nexus_inspiration_on_assignment',
        'nexus_inspiration_on_question',
        'nexus_inspiration_on_submission',
        'nexus_inspiration_on_submission_tag',
        'cleanup_old_sessions',
        'create_notification',
        'end_user_session',
        'get_active_sessions',
        'get_user_session_stats',
        'log_session_event',
        'start_user_session',
        'update_session_section',
        'notify_application_submitted',
        'notify_payment_update',
        'notify_profile_update',
        'notify_user_registered'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 4. Materialized view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'coa_state_stats' AND c.relkind = 'm'
  ) THEN
    REVOKE ALL ON public.coa_state_stats FROM anon, authenticated;
  END IF;
END $$;

-- 5. search_path
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
