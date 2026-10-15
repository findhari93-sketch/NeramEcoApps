-- ============================================================================
-- Demo follow-up cycle + demo enrolment link (spec 2026-10-15, Part A).
-- Demo follow-ups are callback_requests rows (query_type post_demo / demo_rebook)
-- so the Follow-ups queue, badge and timeline see them without a new table.
-- ============================================================================

ALTER TABLE public.callback_requests
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interest_level text,
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.callback_requests DROP CONSTRAINT IF EXISTS callback_requests_interest_level_check;
ALTER TABLE public.callback_requests
  ADD CONSTRAINT callback_requests_interest_level_check CHECK (interest_level IS NULL OR interest_level IN ('hot', 'warm', 'cold'));

-- One open demo follow-up per person: a second demo updates it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_callback_one_open_demo_follow_up
  ON public.callback_requests (user_id)
  WHERE user_id IS NOT NULL
    AND query_type IN ('post_demo', 'demo_rebook')
    AND status IN ('pending', 'scheduled', 'attempted');

CREATE INDEX IF NOT EXISTS idx_callback_requests_demo ON public.callback_requests (demo_registration_id)
  WHERE demo_registration_id IS NOT NULL;

-- Same columns as 20261013090000, three appended at the end (OR REPLACE allows appending).
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
  cr.created_at,
  cr.demo_registration_id,
  cr.interest_level,
  cr.flags
FROM public.callback_requests cr
LEFT JOIN public.users u ON u.id = cr.user_id
LEFT JOIN public.users assignee ON assignee.id = cr.assigned_to
LEFT JOIN public.users owner ON owner.id = u.crm_owner_id
LEFT JOIN public.user_lifecycle_view lv ON lv.id = cr.user_id
WHERE cr.status IN ('pending', 'scheduled', 'attempted')
  AND COALESCE(cr.is_dead_lead, false) = false;

-- Direct Enroll links made from a demo: whose account and which demo.
ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL;

-- Anyone with the anon key could read every active link (name, phone, email,
-- fees). Validation runs on the server with the service role.
DROP POLICY IF EXISTS "Anyone can validate active links by token" ON public.direct_enrollment_links;

-- The application that came from a demo.
ALTER TABLE public.lead_profiles
  ADD COLUMN IF NOT EXISTS demo_registration_id uuid REFERENCES public.demo_class_registrations(id) ON DELETE SET NULL;

-- Teams digests: built by the admin cron, sent by Nexus (it owns the Neram Assistant bot).
CREATE TABLE IF NOT EXISTS public.staff_digest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('follow_up_digest', 'follow_up_manager', 'follow_up_soon')),
  dedupe_key text NOT NULL UNIQUE,
  subject text NOT NULL,
  plain text NOT NULL,
  link text NOT NULL,
  send_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_digest_due ON public.staff_digest_messages (send_after) WHERE status = 'pending';
ALTER TABLE public.staff_digest_messages ENABLE ROW LEVEL SECURITY;

-- get_user_timeline: adds "Attended a demo class" and "Joined through a demo class".
CREATE OR REPLACE FUNCTION public.get_user_timeline(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  occurred_at timestamptz,
  kind text,
  title text,
  detail jsonb,
  actor_id uuid,
  source_app text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (
    -- First-party events (sign-up steps, tools, applications, payments...)
    SELECT e.created_at AS occurred_at, 'event' AS kind,
           e.event AS title,
           jsonb_strip_nulls(jsonb_build_object('funnel', e.funnel, 'status', e.status, 'page', e.page_url,
             'error', e.error_code, 'metadata', NULLIF(e.metadata, '{}'::jsonb))) AS detail,
           NULL::uuid AS actor_id, e.source_app
      FROM user_funnel_events e
     WHERE e.user_id = p_user_id AND e.status IN ('completed', 'failed', 'skipped')
    UNION ALL
    SELECT s.occurred_at, 'sign_in', 'Opened Nexus', jsonb_build_object('outcome', s.outcome), NULL, 'nexus'
      FROM nexus_sign_in_events s WHERE s.user_id = p_user_id
    UNION ALL
    SELECT COALESCE(p.paid_at, p.created_at), 'payment',
           CASE p.status::text WHEN 'paid' THEN 'Paid' WHEN 'failed' THEN 'Payment failed'
                               WHEN 'refunded' THEN 'Refunded' ELSE 'Payment ' || p.status::text END,
           jsonb_strip_nulls(jsonb_build_object('amount', p.amount, 'method', p.payment_method,
             'receipt', p.receipt_number, 'installment', p.installment_number)),
           p.verified_by, NULL
      FROM payments p WHERE p.user_id = p_user_id AND p.status::text IN ('paid', 'failed', 'refunded')
    UNION ALL
    SELECT d.created_at, 'demo', 'Booked a demo class',
           jsonb_strip_nulls(jsonb_build_object('status', d.status::text, 'ref', d.ref_code)), NULL, NULL
      FROM demo_class_registrations d WHERE d.user_id = p_user_id
    UNION ALL
    SELECT COALESCE(d.scheduled_start, d.attendance_marked_at), 'demo', 'Attended a demo class',
           jsonb_strip_nulls(jsonb_build_object('ref', d.ref_code)), d.attendance_marked_by, 'admin'
      FROM demo_class_registrations d WHERE d.user_id = p_user_id AND d.attended IS TRUE
    UNION ALL
    SELECT COALESCE(lp.reviewed_at, lp.updated_at), 'enrollment', 'Joined through a demo class',
           jsonb_strip_nulls(jsonb_build_object('ref', dd.ref_code)), lp.reviewed_by, 'admin'
      FROM lead_profiles lp JOIN demo_class_registrations dd ON dd.id = lp.demo_registration_id
     WHERE lp.user_id = p_user_id
    UNION ALL
    SELECT h.created_at, 'change',
           CASE WHEN h.change_source = 'user' THEN 'Updated ' ELSE 'Staff changed ' END || replace(h.field_name, '_', ' '),
           jsonb_strip_nulls(jsonb_build_object('field', h.field_name, 'from', h.old_value, 'to', h.new_value,
             'by', h.change_source)),
           CASE WHEN h.change_source = 'user' THEN NULL ELSE h.changed_by END, NULL
      FROM user_profile_history h WHERE h.user_id = p_user_id
    UNION ALL
    SELECT n.created_at, 'note', 'Staff note', jsonb_build_object('note', left(n.note, 500), 'by_name', n.admin_name),
           n.admin_id, 'admin'
      FROM admin_user_notes n WHERE n.user_id = p_user_id
    UNION ALL
    SELECT ca.attempted_at, 'call', 'Call: ' || replace(ca.outcome::text, '_', ' '),
           jsonb_strip_nulls(jsonb_build_object('outcome', ca.outcome::text)), ca.user_id, 'admin'
      FROM callback_attempts ca JOIN callback_requests cr ON cr.id = ca.callback_request_id
     WHERE cr.user_id = p_user_id
    UNION ALL
    SELECT COALESCE(m.sent_at, m.created_at), 'message',
           initcap(m.channel) || ' ' || replace(m.message_type, '_', ' ') ||
             CASE WHEN m.delivery_status = 'sent' THEN '' ELSE ' (' || m.delivery_status || ')' END,
           jsonb_strip_nulls(jsonb_build_object('channel', m.channel, 'status', m.delivery_status,
             'template', m.template_name)), NULL, 'admin'
      FROM auto_messages m WHERE m.user_id = p_user_id AND m.delivery_status IN ('sent', 'delivered', 'read', 'failed')
    UNION ALL
    SELECT nd.created_at, 'message', 'Nexus notice: ' || replace(nd.event_type, '_', ' '),
           jsonb_strip_nulls(jsonb_build_object('channel', nd.channel, 'teams_chat', nd.chat, 'bell', nd.inapp)),
           NULL, 'nexus'
      FROM nexus_notification_deliveries nd WHERE nd.recipient_id = p_user_id
    UNION ALL
    SELECT eh.created_at, 'enrollment',
           CASE eh.action WHEN 'enrolled' THEN 'Added to a classroom' WHEN 'removed' THEN 'Removed from a classroom'
                          WHEN 'restored' THEN 'Restored to a classroom' ELSE initcap(eh.action) END,
           jsonb_strip_nulls(jsonb_build_object('classroom', c.name, 'reason', eh.reason_category, 'notes', eh.notes)),
           eh.performed_by, 'nexus'
      FROM nexus_enrollment_history eh LEFT JOIN nexus_classrooms c ON c.id = eh.classroom_id
     WHERE eh.user_id = p_user_id
    UNION ALL
    SELECT ce.created_at, 'classification',
           initcap(replace(ce.axis, '_', ' ')) || ': ' || COALESCE(ce.from_value, 'not set') || ' to ' || COALESCE(ce.to_value, 'not set'),
           jsonb_strip_nulls(jsonb_build_object('reason', ce.reason)), ce.performed_by, 'nexus'
      FROM nexus_enrollment_classification_events ce WHERE ce.student_id = p_user_id
    UNION ALL
    SELECT f.created_at, 'feedback', 'Gave feedback' || COALESCE(' (' || f.rating || '/5)', ''),
           jsonb_strip_nulls(jsonb_build_object('category', f.category::text, 'text', left(f.description, 300))), NULL, f.source
      FROM app_feedback f WHERE f.user_id = p_user_id
    UNION ALL
    SELECT ml.merged_at, 'merge', 'Duplicate record merged into this one',
           jsonb_strip_nulls(jsonb_build_object('merged_email', ml.loser_snapshot->>'email',
             'merged_name', ml.loser_snapshot->>'name')), ml.merged_by, 'admin'
      FROM user_merge_log ml WHERE ml.winner_id = p_user_id
    UNION ALL
    SELECT u.created_at, 'account', 'Account created',
           jsonb_strip_nulls(jsonb_build_object('source', u.first_touch->>'utm_source', 'landing_page', u.first_touch->>'landing_page')),
           NULL, NULL
      FROM users u WHERE u.id = p_user_id
  )
  SELECT occurred_at, kind, title, detail, actor_id, source_app
    FROM t
   WHERE occurred_at IS NOT NULL
     AND (p_before IS NULL OR occurred_at < p_before)
   ORDER BY occurred_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.get_user_timeline(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_timeline(uuid, integer, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
