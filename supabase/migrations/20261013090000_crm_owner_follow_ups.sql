-- ============================================================================
-- CRM: an owner per person, one follow-up queue, conversion by signup month.
--
--   users.crm_owner_id    the staff member responsible for this person. A
--                         foreign key on purpose: merge_user_records repoints it
--                         when a staff record is merged, and a deleted staff row
--                         leaves the person unowned instead of blocking.
--   crm_follow_ups        open callbacks with one due time, the person, the call
--                         owner and the person's owner. The "Due today" list.
--   crm_conversion_monthly  people who signed up each month and how far they got.
--
-- No tasks table: callback_requests already carries owner, due time and
-- outcome (lifecycle plan, Part D).
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS crm_owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS crm_owner_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_crm_owner ON public.users (crm_owner_id) WHERE crm_owner_id IS NOT NULL;

CREATE OR REPLACE VIEW public.crm_follow_ups
WITH (security_invoker = true) AS
SELECT
  cr.id AS callback_id,
  cr.user_id,
  COALESCE(u.name, cr.name) AS person_name,
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
  cr.created_at
FROM public.callback_requests cr
LEFT JOIN public.users u ON u.id = cr.user_id
LEFT JOIN public.users assignee ON assignee.id = cr.assigned_to
LEFT JOIN public.users owner ON owner.id = u.crm_owner_id
LEFT JOIN public.user_lifecycle_view lv ON lv.id = cr.user_id
WHERE cr.status IN ('pending', 'scheduled', 'attempted')
  AND COALESCE(cr.is_dead_lead, false) = false;

COMMENT ON VIEW public.crm_follow_ups IS 'Open callbacks with one due time, for the admin Follow-ups queue.';

CREATE OR REPLACE VIEW public.crm_conversion_monthly
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata')::date AS signup_month,
  count(*) AS signed_up,
  count(*) FILTER (WHERE lifecycle_stage IN ('lead', 'applicant', 'enrolled', 'active_student', 'paused', 'alumni')) AS became_lead,
  count(*) FILTER (WHERE lifecycle_stage IN ('applicant', 'enrolled', 'active_student', 'paused', 'alumni')
                    OR crm_stage IN ('application_submitted', 'admin_approved', 'payment_complete', 'enrolled')) AS applied,
  count(*) FILTER (WHERE lifecycle_stage IN ('enrolled', 'active_student', 'paused', 'alumni')
                    OR crm_stage IN ('payment_complete', 'enrolled')) AS enrolled
FROM public.user_lifecycle_view
GROUP BY 1;

COMMENT ON VIEW public.crm_conversion_monthly IS
  'Signups per month (India time) and how many reached lead, application and enrolment. Current stage, so a month can still rise.';

-- Deleting a user deletes their user_profile_history too, so a delete left no
-- trace. This keeps who was deleted, by whom and why.
CREATE TABLE IF NOT EXISTS public.user_deletion_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  snapshot    jsonb NOT NULL,
  deleted_by  uuid,
  reason      text,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_deletion_log_at ON public.user_deletion_log (deleted_at DESC);
ALTER TABLE public.user_deletion_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_deletion_log FROM anon, authenticated;

REVOKE ALL ON public.crm_follow_ups FROM anon, authenticated;
REVOKE ALL ON public.crm_conversion_monthly FROM anon, authenticated;
GRANT SELECT ON public.crm_follow_ups TO service_role;
GRANT SELECT ON public.crm_conversion_monthly TO service_role;

NOTIFY pgrst, 'reload schema';
