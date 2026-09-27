-- ============================================================================
-- users.last_meaningful_activity_at: the latest thing a person actually did.
--
-- Login alone is a poor dormancy signal (the lifecycle spec, section 18), and
-- until now "last active" was worked out differently on every screen. One
-- daily SQL rollup, run by pg_cron inside the database (no Vercel invocation,
-- no HTTP, no secret), takes the newest of:
--
--   sign_in          users.last_login_at (tools app, marketing, Nexus)
--   nexus_sign_in    users.nexus_last_login_at, nexus_sign_in_events
--   app_event        a completed first-party event (auth, tool, application...)
--   tool             tool_usage_logs
--   drawing          drawing_submissions.submitted_at
--   class_attended   nexus_attendance where attended
--   payment          a paid payment
--   profile_update   user_profile_history written by the user themselves
--   replied_to_call  a callback attempt where staff talked to them
--
-- It is a signal for staff screens only. It never changes access: nothing
-- reads it to disable an account or end an enrolment.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_meaningful_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_meaningful_activity_source text;

CREATE INDEX IF NOT EXISTS idx_users_last_meaningful_activity
  ON public.users (last_meaningful_activity_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.refresh_user_meaningful_activity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  changed integer;
BEGIN
  WITH src AS (
    SELECT id AS user_id, last_login_at AS ts, 'sign_in' AS source FROM users WHERE last_login_at IS NOT NULL
    UNION ALL
    SELECT id, nexus_last_login_at, 'nexus_sign_in' FROM users WHERE nexus_last_login_at IS NOT NULL
    UNION ALL
    SELECT user_id, max(occurred_at), 'nexus_sign_in' FROM nexus_sign_in_events GROUP BY user_id
    UNION ALL
    SELECT user_id, max(created_at), 'app_event' FROM user_funnel_events
      WHERE user_id IS NOT NULL AND status = 'completed' GROUP BY user_id
    UNION ALL
    SELECT user_id, max(created_at), 'tool' FROM tool_usage_logs WHERE user_id IS NOT NULL GROUP BY user_id
    UNION ALL
    SELECT student_id, max(submitted_at), 'drawing' FROM drawing_submissions
      WHERE student_id IS NOT NULL GROUP BY student_id
    UNION ALL
    SELECT student_id, max(COALESCE(joined_at, created_at)), 'class_attended' FROM nexus_attendance
      WHERE attended IS TRUE AND student_id IS NOT NULL GROUP BY student_id
    UNION ALL
    SELECT user_id, max(COALESCE(paid_at, created_at)), 'payment' FROM payments
      WHERE status = 'paid' AND user_id IS NOT NULL GROUP BY user_id
    UNION ALL
    SELECT user_id, max(created_at), 'profile_update' FROM user_profile_history
      WHERE change_source = 'user' GROUP BY user_id
    UNION ALL
    SELECT cr.user_id, max(ca.attempted_at), 'replied_to_call'
      FROM callback_attempts ca JOIN callback_requests cr ON cr.id = ca.callback_request_id
      WHERE ca.outcome = 'talked' AND cr.user_id IS NOT NULL GROUP BY cr.user_id
  ),
  best AS (
    SELECT DISTINCT ON (user_id) user_id, ts, source
    FROM src
    -- A clock-skewed future timestamp must not pin someone as "active" for years.
    WHERE ts IS NOT NULL AND ts <= now() + interval '1 day'
    ORDER BY user_id, ts DESC
  )
  UPDATE users u
     SET last_meaningful_activity_at = b.ts,
         last_meaningful_activity_source = b.source
    FROM best b
   WHERE u.id = b.user_id
     AND (u.last_meaningful_activity_at IS DISTINCT FROM b.ts
          OR u.last_meaningful_activity_source IS DISTINCT FROM b.source);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_user_meaningful_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_meaningful_activity() TO service_role;

-- First fill.
SELECT public.refresh_user_meaningful_activity();

-- Daily at 02:45 IST (21:15 UTC). Guarded so a local Supabase without pg_cron
-- still applies the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-user-activity';
    PERFORM cron.schedule('refresh-user-activity', '15 21 * * *', 'SELECT public.refresh_user_meaningful_activity()');
  END IF;
END $$;
