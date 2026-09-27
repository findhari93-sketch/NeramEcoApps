-- ============================================================================
-- Only the service role may call the remaining SECURITY DEFINER write
-- functions that anon and authenticated could still EXECUTE with the public key.
--
--   set_current_avatar            changes any user's current avatar (no caller in the repo)
--   record_profile_change         forges user_profile_history rows (no caller in the repo)
--   create_lead_profile           creates a lead profile for any user id
--   initialize_student_onboarding creates onboarding rows for any student
--   record_ai_usage_daily         inflates AI spend, which can trip the budget block
--
-- Every caller uses the service-role client (applications.ts createApplication
-- from app, marketing and admin API routes; post-enrollment-onboarding.ts and the
-- admin reconcile and sync-entra routes; ai-usage.ts). No other function or
-- trigger calls them.
--
-- Left open on purpose: check_username_available and suggest_usernames. The app
-- /api/auth/check-username route calls them with the anon client and they only
-- say whether a username is taken.
--
-- REVOKE ... FROM PUBLIC alone is not enough on Supabase: revoke from each role.
-- ============================================================================

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
        'set_current_avatar',
        'record_profile_change',
        'create_lead_profile',
        'initialize_student_onboarding',
        'record_ai_usage_daily'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
