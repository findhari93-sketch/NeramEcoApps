-- ============================================================================
-- Nightly auto-archive of quiet leads, and auto-return when they come back.
--
-- The People page grew to 1,873 people, 1,392 of them from earlier exam seasons
-- and only about 61 of those active in the last 90 days (prod, 2026-10-19).
-- Archiving one suggestion at a time on /lifecycle did not keep up, so the
-- founder asked for it to run on its own (2026-10-19). This replaces the June
-- rule "suggestions only".
--
-- Archive stays CRM-only: it never touches is_disabled, so an archived person
-- still signs in to the Tools app and Nexus as before.
--
--   current_exam_year()        the current season's exam year: the current
--                              batch ('2026-27' -> 2027), else 1 July rule.
--                              Mirrors the admin API's currentExamYear.
--   auto_archive_candidates()  who would be archived now, with the rule:
--     earlier_season  exam year before the current season, no meaningful
--                     activity for earlier_season_idle_days (90)
--     long_quiet      current or later season, signed up and silent for
--                     lead_archive_days (180), the old suggestion rule
--     Only prospects, leads and applicants. Never enrolled, studying, paused,
--     alumni, anyone who paid or has a pending payment, parent accounts or
--     test accounts.
--   run_people_auto_archive(p_triggered_by)
--                              restores first (archived by system:auto and
--                              active since), then archives the candidates,
--                              and writes one row to people_auto_archive_runs.
--   pg_cron 'people-auto-archive' at 22:15 UTC (03:45 IST), after
--   lifecycle-suggestions (22:00), whose open archive_lead suggestions for
--   archived people then expire on their next run.
--
-- Rules live in site_settings.lifecycle_rules: auto_archive_enabled (false
-- until staff turn it on in Admin after the first preview and run),
-- earlier_season_idle_days (90), lead_archive_days (180).
-- ============================================================================

-- Same definition as 20261017090100; repeated because staging missed that file.
CREATE OR REPLACE FUNCTION public.is_test_account(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_email ILIKE 'e2e%@neramclasses.com' OR p_email ILIKE '%@example.com', false);
$$;

CREATE OR REPLACE FUNCTION public.current_exam_year()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT split_part(code, '-', 1)::int + 1
       FROM academic_batches
      WHERE is_current AND code ~ '^\d{4}-\d{2}$'
      LIMIT 1),
    EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Kolkata')::int
      + CASE WHEN EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Kolkata') >= 7 THEN 1 ELSE 0 END
  );
$$;

CREATE TABLE IF NOT EXISTS public.people_auto_archive_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        timestamptz NOT NULL DEFAULT now(),
  triggered_by  text NOT NULL DEFAULT 'cron',
  archived_ids  uuid[] NOT NULL DEFAULT '{}',
  restored_ids  uuid[] NOT NULL DEFAULT '{}',
  archived      integer NOT NULL DEFAULT 0,
  restored      integer NOT NULL DEFAULT 0,
  skipped       boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS people_auto_archive_runs_ran_at ON public.people_auto_archive_runs (ran_at DESC);

ALTER TABLE public.people_auto_archive_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_auto_archive_runs FROM anon, authenticated;
GRANT ALL ON public.people_auto_archive_runs TO service_role;

CREATE OR REPLACE FUNCTION public.auto_archive_candidates()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  exam_year integer,
  exam_year_source text,
  lifecycle_stage text,
  created_at timestamptz,
  last_activity_at timestamptz,
  rule text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules jsonb;
  earlier_days int;
  quiet_days int;
  season int := current_exam_year();
BEGIN
  SELECT value INTO rules FROM site_settings WHERE key = 'lifecycle_rules';
  earlier_days := COALESCE((rules->>'earlier_season_idle_days')::int, 90);
  quiet_days   := COALESCE((rules->>'lead_archive_days')::int, 180);

  RETURN QUERY
  SELECT v.id, v.name, v.email, v.exam_year, v.exam_year_source, v.lifecycle_stage,
         v.created_at, v.last_meaningful_activity_at,
         CASE WHEN v.exam_year < season THEN 'earlier_season' ELSE 'long_quiet' END
    FROM user_lifecycle_view v
   WHERE v.lifecycle_status = 'active'
     AND v.lifecycle_stage IN ('prospect', 'lead', 'applicant')
     AND NOT v.has_pending_payment
     AND COALESCE(v.total_paid, 0) = 0
     AND NOT v.is_guardian_account
     AND NOT is_test_account(v.email)
     AND (
       (v.exam_year < season
         AND v.created_at < now() - make_interval(days => earlier_days)
         AND (v.last_meaningful_activity_at IS NULL
              OR v.last_meaningful_activity_at < now() - make_interval(days => earlier_days)))
       OR
       (v.exam_year >= season
         AND v.created_at < now() - make_interval(days => quiet_days)
         AND (v.last_meaningful_activity_at IS NULL
              OR v.last_meaningful_activity_at < now() - make_interval(days => quiet_days)))
     );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_people_auto_archive(p_triggered_by text DEFAULT 'cron')
RETURNS public.people_auto_archive_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules jsonb;
  enabled boolean;
  earlier_days int;
  quiet_days int;
  season int := current_exam_year();
  restored_list uuid[];
  archived_list uuid[];
  run public.people_auto_archive_runs;
BEGIN
  SELECT value INTO rules FROM site_settings WHERE key = 'lifecycle_rules';
  enabled      := COALESCE((rules->>'auto_archive_enabled')::boolean, false);
  earlier_days := COALESCE((rules->>'earlier_season_idle_days')::int, 90);
  quiet_days   := COALESCE((rules->>'lead_archive_days')::int, 180);

  -- A manual run (Admin "Run now") goes ahead even when the nightly job is off.
  IF NOT enabled AND p_triggered_by = 'cron' THEN
    INSERT INTO people_auto_archive_runs (triggered_by, skipped) VALUES (p_triggered_by, true)
    RETURNING * INTO run;
    RETURN run;
  END IF;

  -- 1. Came back: archived by this job and active again since.
  WITH back AS (
    UPDATE users u
       SET lifecycle_status = 'active', archived_at = NULL, archived_by = NULL, archived_reason = NULL
     WHERE u.lifecycle_status = 'archived'
       AND u.archived_by = 'system:auto'
       AND u.last_meaningful_activity_at > u.archived_at
    RETURNING u.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO restored_list FROM back;

  -- 2. Archive the candidates, with the reason in plain words.
  WITH c AS (SELECT * FROM auto_archive_candidates()),
  done AS (
    UPDATE users u
       SET lifecycle_status = 'archived',
           archived_at = now(),
           archived_by = 'system:auto',
           archived_reason = CASE c.rule
             WHEN 'earlier_season' THEN
               'Auto: the ' || c.exam_year || ' exam season is over and no activity for ' || earlier_days || ' days'
             ELSE 'Auto: no activity for ' || quiet_days || ' days'
           END
      FROM c
     WHERE u.id = c.user_id
       AND u.lifecycle_status = 'active'
       AND NOT (u.id = ANY (restored_list))
    RETURNING u.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO archived_list FROM done;

  -- Their open archive suggestions are done.
  UPDATE lifecycle_suggestions s
     SET status = 'expired', resolved_at = now()
   WHERE s.status = 'open' AND s.kind = 'archive_lead' AND s.user_id = ANY (archived_list);

  INSERT INTO people_auto_archive_runs (triggered_by, archived_ids, restored_ids, archived, restored)
  VALUES (p_triggered_by, archived_list, restored_list,
          COALESCE(array_length(archived_list, 1), 0), COALESCE(array_length(restored_list, 1), 0))
  RETURNING * INTO run;
  RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.current_exam_year() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_exam_year() TO service_role;
REVOKE ALL ON FUNCTION public.auto_archive_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_candidates() TO service_role;
REVOKE ALL ON FUNCTION public.run_people_auto_archive(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_people_auto_archive(text) TO service_role;

-- Defaults for the new rule keys (existing keys are kept).
UPDATE public.site_settings
   SET value = jsonb_build_object('auto_archive_enabled', false, 'earlier_season_idle_days', 90) || value
 WHERE key = 'lifecycle_rules';

-- Off by default and no first run here: staff preview, run and turn it on in Admin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'people-auto-archive';
    PERFORM cron.schedule('people-auto-archive', '15 22 * * *', 'SELECT public.run_people_auto_archive(''cron'')');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
