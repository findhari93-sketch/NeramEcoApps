-- ============================================================================
-- Lifecycle suggestions skip test accounts.
--
-- The daily rules suggested actions for the Playwright fixture accounts: 19 of
-- the 20 open "Check in" suggestions on prod (2026-09-28) were e2e-*@ or
-- e2etesting*@neramclasses.com users. Those accounts must stay (the E2E suites
-- sign in with them), so the rules ignore them instead.
--
-- is_test_account() is the one definition of a test account for SQL:
--   * e2e<anything>@neramclasses.com (e2e-<purpose>@ fixtures and the
--     e2etestingstudent/teacher Microsoft accounts)
--   * anything @example.com (reserved domain, never a real person)
--
-- generate_lifecycle_suggestions below is the live definition from
-- 20261015090000 with the lines marked ADDED. Open suggestions for test
-- accounts expire on every run, and once here.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_test_account(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_email ILIKE 'e2e%@neramclasses.com' OR p_email ILIKE '%@example.com', false);
$$;

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
       OR is_test_account(v.email)  -- ADDED
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
     AND NOT is_test_account(v.email)  -- ADDED
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
     AND NOT is_test_account(v.email)  -- ADDED
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
     AND NOT is_test_account(v.email)  -- ADDED
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
       AND NOT is_test_account(v.email)  -- ADDED
    ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT; added := added + n;
  END IF;

  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_lifecycle_suggestions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_lifecycle_suggestions() TO service_role;

UPDATE public.lifecycle_suggestions s
   SET status = 'expired', resolved_at = now()
  FROM public.users u
 WHERE s.status = 'open'
   AND u.id = s.user_id
   AND public.is_test_account(u.email);
