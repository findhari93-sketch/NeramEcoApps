-- ============================================================================
-- Follow-ups: close what is stale, every night.
--
-- On prod (2026-10-19) Follow-ups showed 54 overdue callbacks, some 226 days
-- old. Nothing ever closed a plain callback: not when the person's exam season
-- passed, not when they joined, not when they were archived. 32 of the 54 had
-- no account, and the page cannot close a row without one. Only about 9 were
-- current or later season leads still worth a call.
--
--   follow_up_expiry_candidates()  open rows that would close now, with a reason.
--     A row with no account is first matched to a person by phone (last 10
--     digits, exactly one match). First rule wins:
--       already_student   student profile, or enrolled / studying / paused / alumni
--       earlier_season    exam year before the current season (an estimated
--                         year only counts once the request is 30+ days old)
--       archived          the person is archived on People
--       counselling_over  a B.Arch / KEAM counselling request 60+ days old
--       no_account_stale  still no account, 30+ days old
--   run_follow_up_expiry(p_triggered_by)
--     links the phone matches (so the request shows on that person's page),
--     then closes the candidates as status 'expired' with closed_reason and
--     closed_by 'system:auto'. Rows are never deleted. The cron run only acts
--     when lifecycle_rules.follow_up_expiry_enabled is true; staff turn it on
--     from Admin > Follow-ups after the first preview.
--     A follow-up staff reopen (closed_by 'staff:reopened') is never closed
--     by the job again.
--   pg_cron 'follow-up-expiry' at 22:20 UTC (03:50 IST), after
--   people-auto-archive (22:15) and before the follow-up digest (03:30 UTC).
--
-- Also: crm_follow_ups shows the name typed on the form when the account name
-- is the placeholder 'User', and carries exam year, archive state and source.
-- visitor_id lets the Aintra chat limit callbacks per visitor.
-- Needs current_exam_year() from 20261209090100_people_auto_archive.sql.
-- ============================================================================

ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS closed_by text,
  ADD COLUMN IF NOT EXISTS visitor_id text;

ALTER TABLE public.callback_requests DROP CONSTRAINT IF EXISTS callback_requests_status_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_status_check
  CHECK (status IN ('pending', 'scheduled', 'attempted', 'completed', 'cancelled', 'dead_lead', 'expired'));

CREATE INDEX IF NOT EXISTS idx_callback_requests_expired
  ON public.callback_requests (completed_at DESC) WHERE status = 'expired';
CREATE INDEX IF NOT EXISTS idx_callback_requests_visitor
  ON public.callback_requests (visitor_id, created_at DESC) WHERE visitor_id IS NOT NULL;

-- Same columns as 20261129090100 with five appended (OR REPLACE allows appending).
CREATE OR REPLACE VIEW public.crm_follow_ups
WITH (security_invoker = true) AS
SELECT
  cr.id AS callback_id,
  cr.user_id,
  COALESCE(NULLIF(NULLIF(btrim(u.name), ''), 'User'), NULLIF(btrim(cr.name), ''), u.name) AS person_name,
  COALESCE(u.phone, cr.phone) AS person_phone,
  cr.status,
  COALESCE(cr.scheduled_callback_at, cr.scheduled_at, cr.preferred_date::timestamptz, cr.created_at) AS due_at,
  cr.preferred_slot,
  cr.query_type,
  cr.notes,
  cr.attempt_count,
  cr.last_attempt_at,
  cr.assigned_to,
  assignee.name AS assigned_to_name,
  u.crm_owner_id,
  owner.name AS owner_name,
  lv.lifecycle_stage,
  lv.crm_stage,
  lv.contacted_status,
  cr.created_at,
  cr.demo_registration_id,
  cr.interest_level,
  cr.flags,
  lv.exam_year,
  lv.exam_year_source,
  lv.lifecycle_status,
  cr.source,
  cr.visitor_id
FROM public.callback_requests cr
LEFT JOIN public.users u ON u.id = cr.user_id
LEFT JOIN public.users assignee ON assignee.id = cr.assigned_to
LEFT JOIN public.users owner ON owner.id = u.crm_owner_id
LEFT JOIN public.user_lifecycle_view lv ON lv.id = cr.user_id
WHERE cr.status IN ('pending', 'scheduled', 'attempted')
  AND COALESCE(cr.is_dead_lead, false) = false;

CREATE OR REPLACE FUNCTION public.follow_up_expiry_candidates()
RETURNS TABLE (
  callback_id     uuid,
  user_id         uuid,
  matched_user_id uuid,
  name            text,
  phone           text,
  query_type      text,
  created_at      timestamptz,
  exam_year       integer,
  reason          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH open_rows AS (
    SELECT cr.id, cr.user_id, cr.name, cr.phone, cr.query_type, cr.created_at,
           right(regexp_replace(COALESCE(cr.phone, ''), '\D', '', 'g'), 10) AS phone10
      FROM callback_requests cr
     WHERE cr.status IN ('pending', 'scheduled', 'attempted')
       AND COALESCE(cr.is_dead_lead, false) = false
       -- Staff reopened it on purpose: never close it again by itself.
       AND cr.closed_by IS DISTINCT FROM 'staff:reopened'
  ),
  phone_match AS (
    SELECT o.id, (array_agg(u.id))[1] AS uid
      FROM open_rows o
      JOIN users u ON right(regexp_replace(u.phone, '\D', '', 'g'), 10) = o.phone10
     WHERE o.user_id IS NULL AND length(o.phone10) = 10 AND u.phone IS NOT NULL
     GROUP BY o.id
    HAVING count(*) = 1
  ),
  rows AS (
    SELECT o.*, pm.uid AS matched, COALESCE(o.user_id, pm.uid) AS person
      FROM open_rows o LEFT JOIN phone_match pm ON pm.id = o.id
  ),
  judged AS (
    SELECT r.id, r.user_id, r.matched, COALESCE(NULLIF(btrim(r.name), ''), lv.name) AS name, r.phone,
           r.query_type, r.created_at, lv.exam_year,
           CASE
             WHEN r.person IS NOT NULL AND (
                    EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.user_id = r.person)
                    OR lv.lifecycle_stage IN ('enrolled_not_started', 'active_student', 'paused', 'alumni'))
               THEN 'already_student'
             WHEN lv.exam_year IS NOT NULL AND lv.exam_year < current_exam_year()
                  AND (COALESCE(lv.exam_year_source, 'signup') <> 'signup' OR r.created_at < now() - interval '30 days')
               THEN 'earlier_season'
             WHEN lv.lifecycle_status = 'archived'
               THEN 'archived'
             WHEN r.query_type LIKE '%\_counselling' AND r.created_at < now() - interval '60 days'
               THEN 'counselling_over'
             WHEN r.person IS NULL AND r.created_at < now() - interval '30 days'
               THEN 'no_account_stale'
           END AS reason
      FROM rows r
      LEFT JOIN user_lifecycle_view lv ON lv.id = r.person
  )
  SELECT id, user_id, matched, name, phone, query_type, created_at, exam_year, reason
    FROM judged
   WHERE reason IS NOT NULL
   ORDER BY created_at;
$$;

CREATE OR REPLACE FUNCTION public.run_follow_up_expiry(p_triggered_by text DEFAULT 'cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enabled boolean;
  linked integer := 0;
  closed integer := 0;
  by_reason jsonb;
BEGIN
  SELECT COALESCE((value->>'follow_up_expiry_enabled')::boolean, false) INTO enabled
    FROM site_settings WHERE key = 'lifecycle_rules';
  IF p_triggered_by = 'cron' AND NOT COALESCE(enabled, false) THEN
    RETURN jsonb_build_object('skipped', true, 'linked', 0, 'closed', 0, 'by_reason', '{}'::jsonb);
  END IF;

  CREATE TEMP TABLE _expiry ON COMMIT DROP AS SELECT * FROM follow_up_expiry_candidates();

  -- Every phone match is linked, closing or not: the request then shows on that person's page.
  WITH m AS (
    SELECT cr.id, (array_agg(u.id))[1] AS uid
      FROM callback_requests cr
      JOIN users u ON right(regexp_replace(u.phone, '\D', '', 'g'), 10) = right(regexp_replace(cr.phone, '\D', '', 'g'), 10)
     WHERE cr.user_id IS NULL
       AND cr.status IN ('pending', 'scheduled', 'attempted')
       AND length(right(regexp_replace(COALESCE(cr.phone, ''), '\D', '', 'g'), 10)) = 10
       AND u.phone IS NOT NULL
     GROUP BY cr.id
    HAVING count(*) = 1
  )
  UPDATE callback_requests c SET user_id = m.uid, updated_at = now()
    FROM m WHERE c.id = m.id;
  GET DIAGNOSTICS linked = ROW_COUNT;

  UPDATE callback_requests c
     SET status = 'expired', closed_reason = e.reason, closed_by = 'system:auto',
         completed_at = now(), updated_at = now()
    FROM _expiry e
   WHERE c.id = e.callback_id
     AND c.status IN ('pending', 'scheduled', 'attempted');
  GET DIAGNOSTICS closed = ROW_COUNT;

  SELECT COALESCE(jsonb_object_agg(reason, n), '{}'::jsonb) INTO by_reason
    FROM (SELECT reason, count(*) AS n FROM _expiry GROUP BY reason) t;

  RETURN jsonb_build_object('skipped', false, 'linked', linked, 'closed', closed, 'by_reason', by_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.follow_up_expiry_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follow_up_expiry_candidates() TO service_role;
REVOKE ALL ON FUNCTION public.run_follow_up_expiry(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_follow_up_expiry(text) TO service_role;

-- Off until staff preview and run it from Admin > Follow-ups.
UPDATE public.site_settings
   SET value = jsonb_build_object('follow_up_expiry_enabled', false) || value
 WHERE key = 'lifecycle_rules';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'follow-up-expiry';
    PERFORM cron.schedule('follow-up-expiry', '20 22 * * *', 'SELECT public.run_follow_up_expiry(''cron'')');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
