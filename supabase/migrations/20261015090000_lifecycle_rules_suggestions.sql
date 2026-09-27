-- ============================================================================
-- Lifecycle automation that only ever suggests.
--
-- Rules live in site_settings['lifecycle_rules'] (edited on the admin Settings
-- page), not in code. A daily pg_cron job turns them into lifecycle_suggestions
-- rows. A person accepts or dismisses each one in admin; nothing here archives,
-- deactivates or graduates anyone by itself (recorded decisions: dormancy is
-- never access control, archive never disables login, graduation is a person's
-- call because it offboards Microsoft).
--
-- Kinds:
--   check_in_student    an enrolled student has gone quiet   -> a call or message
--   archive_lead        a lead with no activity for months   -> CRM archive
--   deactivate_account  archived, silent for a long time     -> disable sign-in
--   graduate_student    enrolled in a batch that has closed  -> Graduate
--
-- Before suggesting deactivation (spec section 19) it checks: no live
-- enrolment, no pending payment, no open support ticket, no application in
-- progress, no recent activity.
-- ============================================================================

INSERT INTO public.site_settings (key, value, updated_at)
VALUES (
  'lifecycle_rules',
  jsonb_build_object(
    'student_quiet_days', 21,
    'lead_archive_days', 180,
    'archived_deactivate_days', 365,
    'suggest_graduation', true,
    'join_reminder_days', jsonb_build_array(1, 3, 7),
    'not_started_decision_days', 14
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lifecycle_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('check_in_student', 'archive_lead', 'deactivate_account', 'graduate_student')),
  reason       text NOT NULL,
  evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  note         text
);

-- One open suggestion per person and kind.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_suggestions_open
  ON public.lifecycle_suggestions (user_id, kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_lifecycle_suggestions_open
  ON public.lifecycle_suggestions (kind, created_at DESC) WHERE status = 'open';

ALTER TABLE public.lifecycle_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lifecycle_suggestions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_lifecycle_suggestions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules jsonb;
  quiet_days int;
  archive_days int;
  deactivate_days int;
  graduate boolean;
  current_batch text;
  added int := 0;
  n int;
BEGIN
  SELECT value INTO rules FROM site_settings WHERE key = 'lifecycle_rules';
  quiet_days      := COALESCE((rules->>'student_quiet_days')::int, 21);
  archive_days    := COALESCE((rules->>'lead_archive_days')::int, 180);
  deactivate_days := COALESCE((rules->>'archived_deactivate_days')::int, 365);
  graduate        := COALESCE((rules->>'suggest_graduation')::boolean, true);
  SELECT code INTO current_batch FROM academic_batches WHERE is_current LIMIT 1;

  -- Suggestions whose condition no longer holds expire on their own.
  UPDATE lifecycle_suggestions s SET status = 'expired', resolved_at = now()
    FROM user_lifecycle_view v
   WHERE s.status = 'open' AND v.id = s.user_id
     AND (
       (s.kind = 'check_in_student' AND (v.lifecycle_stage NOT IN ('active_student', 'enrolled')
          OR v.last_meaningful_activity_at >= now() - make_interval(days => quiet_days)))
       OR (s.kind = 'archive_lead' AND (v.lifecycle_status = 'archived'
          OR v.last_meaningful_activity_at >= now() - make_interval(days => archive_days)))
       OR (s.kind = 'deactivate_account' AND (v.is_disabled OR v.lifecycle_status <> 'archived'
          OR v.last_meaningful_activity_at >= now() - make_interval(days => deactivate_days)))
       OR (s.kind = 'graduate_student' AND v.is_alumni)
     );

  -- 1. Enrolled students who went quiet: a human should check in.
  INSERT INTO lifecycle_suggestions (user_id, kind, reason, evidence)
  SELECT v.id, 'check_in_student',
         'No activity for ' || quiet_days || '+ days while enrolled',
         jsonb_build_object('last_activity_at', v.last_meaningful_activity_at,
                            'last_activity', v.last_meaningful_activity_source,
                            'classroom', v.nexus_classroom_name)
    FROM user_lifecycle_view v
   WHERE v.lifecycle_stage IN ('active_student', 'enrolled')
     AND v.nexus_classroom_id IS NOT NULL
     AND (v.last_meaningful_activity_at IS NULL OR v.last_meaningful_activity_at < now() - make_interval(days => quiet_days))
  ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  -- 2. Leads silent for months: suggest the reversible CRM archive.
  INSERT INTO lifecycle_suggestions (user_id, kind, reason, evidence)
  SELECT v.id, 'archive_lead',
         'Lead with no activity for ' || archive_days || '+ days',
         jsonb_build_object('last_activity_at', v.last_meaningful_activity_at, 'stage', v.lifecycle_stage,
                            'crm_stage', v.crm_stage)
    FROM user_lifecycle_view v
   WHERE v.lifecycle_stage IN ('prospect', 'lead', 'applicant')
     AND v.lifecycle_status = 'active'
     AND v.created_at < now() - make_interval(days => archive_days)
     AND (v.last_meaningful_activity_at IS NULL OR v.last_meaningful_activity_at < now() - make_interval(days => archive_days))
     AND NOT v.has_pending_payment
  ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  -- 3. Archived and silent for a long time: suggest disabling sign-in, with the
  --    spec's exception checks.
  INSERT INTO lifecycle_suggestions (user_id, kind, reason, evidence)
  SELECT v.id, 'deactivate_account',
         'Archived with no activity for ' || deactivate_days || '+ days',
         jsonb_build_object('archived_at', v.archived_at, 'last_activity_at', v.last_meaningful_activity_at)
    FROM user_lifecycle_view v
   WHERE v.lifecycle_status = 'archived'
     AND NOT v.is_disabled
     AND v.nexus_classroom_id IS NULL
     AND NOT v.has_pending_payment
     AND COALESCE(v.application_status::text, '') NOT IN ('submitted', 'under_review', 'pending_verification', 'approved', 'partial_payment')
     AND (v.last_meaningful_activity_at IS NULL OR v.last_meaningful_activity_at < now() - make_interval(days => deactivate_days))
     AND NOT EXISTS (SELECT 1 FROM support_tickets t WHERE t.user_id = v.id AND t.status::text IN ('open', 'in_progress'))
  ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; added := added + n;

  -- 4. Enrolled in a batch older than the current one: suggest Graduate.
  IF graduate AND current_batch IS NOT NULL THEN
    INSERT INTO lifecycle_suggestions (user_id, kind, reason, evidence)
    SELECT v.id, 'graduate_student',
           'Batch ' || v.academic_year || ' has ended (current batch ' || current_batch || ')',
           jsonb_build_object('academic_year', v.academic_year, 'current_batch', current_batch)
      FROM user_lifecycle_view v
     WHERE NOT v.is_alumni
       AND v.lifecycle_stage IN ('active_student', 'enrolled', 'paused')
       AND v.academic_year IS NOT NULL
       AND v.academic_year < current_batch
    ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  END IF;

  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_lifecycle_suggestions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_lifecycle_suggestions() TO service_role;

-- Runs after the activity rollup (21:15 UTC) so it reads fresh activity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lifecycle-suggestions';
    PERFORM cron.schedule('lifecycle-suggestions', '0 22 * * *', 'SELECT public.generate_lifecycle_suggestions()');
  END IF;
END $$;

SELECT public.generate_lifecycle_suggestions();

NOTIFY pgrst, 'reload schema';
