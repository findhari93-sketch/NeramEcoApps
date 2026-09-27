-- ============================================================================
-- get_user_timeline: one chronological history of a person, across every app.
--
-- The User 360 Activity tab (admin /crm/[id], Nexus students/[id]) reads this
-- instead of stitching tables in React. Each row: when, kind, a short title, a
-- detail object, and the staff member who acted (null when the person did it).
--
-- Sources: first-party events, sign-ins, tool use, payments, demo bookings,
-- application changes, staff edits, CRM notes, calls, messages sent, Nexus
-- enrolment and classification changes, feedback, merges.
--
-- Paged by time: pass p_before (exclusive) to load older rows. Titles are plain
-- English because both apps show them as they are.
-- ============================================================================

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
           jsonb_strip_nulls(jsonb_build_object('status', d.status::text, 'attended', d.attended)), NULL, NULL
      FROM demo_class_registrations d WHERE d.user_id = p_user_id
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
