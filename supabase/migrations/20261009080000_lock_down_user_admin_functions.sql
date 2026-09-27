-- ============================================================================
-- Only the service role may merge, preview-merge or bulk-delete users.
--
-- All five functions are SECURITY DEFINER (they run as the owner, past RLS) and
-- were EXECUTE-able by anon and authenticated, i.e. by anyone holding the public
-- anon key that ships in every browser bundle. merge_user_records and
-- admin_bulk_delete_users hard-delete users.
--
-- Every caller in the repo uses the service-role client
-- (packages/database/src/queries/user-merge.ts, crm.ts adminBulkDeleteUsers).
--
-- REVOKE ... FROM PUBLIC alone is not enough on Supabase: default privileges
-- grant EXECUTE to anon and authenticated directly, so revoke from each role.
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
      AND p.proname IN ('merge_user_records', 'preview_user_merge', '_merge_dedupe_unique', 'admin_bulk_delete_users')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
