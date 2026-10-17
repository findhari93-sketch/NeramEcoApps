-- Support tickets (Admin inbox) get the same lifecycle Nexus tickets have.
--
-- Until now an Admin ticket had a Status dropdown that saved on pick, a Resolve
-- button that vanished once resolved, and no way to reopen, close with a reason,
-- or ask the requester for more. This file adds what that lifecycle needs:
--
--   1. columns that say how a ticket ended, whose turn it is, and when it closes
--   2. internal notes on comments (staff only, never sent to the requester)
--   3. support_ticket_activity, one row per move, the thread's system lines
--   4. support_ticket_queue_counts(), the inbox tab counts in one call
--   5. a backfill so existing rows land in the new model quietly
--
-- The rules for which move is allowed from which status live in
-- packages/database/src/utils/support-ticket-status.ts.

-- ---------------------------------------------------------------------------
-- 1. Ticket columns
-- ---------------------------------------------------------------------------
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_close_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reply_by text,
  ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS student_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requester_segment text;

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_resolution_code_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_resolution_code_check
  CHECK (resolution_code IS NULL OR resolution_code IN (
    'fixed', 'answered', 'not_a_bug', 'duplicate', 'wont_fix', 'no_response'
  ));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_last_reply_by_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_last_reply_by_check
  CHECK (last_reply_by IS NULL OR last_reply_by IN ('staff', 'student'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_requester_segment_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_requester_segment_check
  CHECK (requester_segment IS NULL OR requester_segment IN ('enrolled', 'lead', 'guest', 'staff'));

COMMENT ON COLUMN support_tickets.resolution_code IS
  'How the ticket ended: fixed, answered, not_a_bug, duplicate, wont_fix, or no_response (auto-close only). Cleared on reopen.';
COMMENT ON COLUMN support_tickets.auto_close_at IS
  'When the auto-close cron closes this ticket: 7 days after asking the requester, 3 days after resolving. Null otherwise.';
COMMENT ON COLUMN support_tickets.closed_at IS
  'When the ticket closed. The requester may reopen for 7 days after this. Not updated_at, which any edit moves.';
COMMENT ON COLUMN support_tickets.context IS
  'Staff-only extras. reopens[] holds a device and console snapshot for each "still happening", newest last, at most 5.';
COMMENT ON COLUMN support_tickets.requester_segment IS
  'Who raised it, at the time: enrolled student, lead, guest (signed out) or staff. For triage.';

-- ---------------------------------------------------------------------------
-- 2. Internal notes
-- ---------------------------------------------------------------------------
ALTER TABLE support_ticket_comments
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN support_ticket_comments.is_internal IS
  'Staff-only note. Never returned to the requester and never notifies anyone.';

-- ---------------------------------------------------------------------------
-- 3. Activity log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_ticket_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- NULL actor means the system (cron, migration).
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  old_status text,
  new_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_to_student boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_activity_action_check CHECK (action IN (
    'created', 'started', 'assigned', 'unassigned',
    'info_requested', 'student_replied', 'resumed',
    'resolved', 'confirmed', 'reopened', 'closed', 'auto_closed',
    'priority_changed', 'category_changed'
  ))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_activity_ticket
  ON support_ticket_activity (ticket_id, created_at);

ALTER TABLE support_ticket_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to ticket activity" ON support_ticket_activity;
CREATE POLICY "Service role full access to ticket activity"
  ON support_ticket_activity FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Indexes for the inbox queues, the cron and the report rate limit
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_auto_close
  ON support_tickets (auto_close_at)
  WHERE auto_close_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
  ON support_tickets (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_created
  ON support_tickets (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------------
--
-- The updated_at trigger is off while this runs. Otherwise every old ticket
-- would look freshly touched. No notifications are sent: nothing here goes
-- through the API.
ALTER TABLE support_tickets DISABLE TRIGGER set_support_tickets_updated_at;

-- 'resolved' meant "done" in the old model. In the new one done is 'closed'
-- with an outcome. Not awaiting_confirmation: that would start a 3 day clock
-- and email people about tickets they forgot months ago.
UPDATE support_tickets
   SET status = 'closed',
       resolution_code = COALESCE(resolution_code, 'fixed'),
       closed_at = COALESCE(closed_at, resolved_at, updated_at)
 WHERE status::text = 'resolved';

UPDATE support_tickets
   SET closed_at = COALESCE(resolved_at, updated_at)
 WHERE status::text = 'closed'
   AND closed_at IS NULL;

-- Newest public comment decides whose reply came last.
UPDATE support_tickets t
   SET last_reply_at = c.created_at,
       last_reply_by = CASE WHEN c.is_admin THEN 'staff' ELSE 'student' END
  FROM (
    SELECT DISTINCT ON (ticket_id) ticket_id, created_at, is_admin
      FROM support_ticket_comments
     ORDER BY ticket_id, created_at DESC
  ) c
 WHERE c.ticket_id = t.id
   AND t.last_reply_at IS NULL;

UPDATE support_tickets t
   SET first_response_at = c.first_at
  FROM (
    SELECT ticket_id, MIN(created_at) AS first_at
      FROM support_ticket_comments
     WHERE is_admin
     GROUP BY ticket_id
  ) c
 WHERE c.ticket_id = t.id
   AND t.first_response_at IS NULL;

-- Existing staff have seen everything already. Without this every old
-- ticket with a student reply would light the unread dot.
UPDATE support_tickets
   SET staff_seen_at = COALESCE(last_reply_at, updated_at)
 WHERE staff_seen_at IS NULL;

ALTER TABLE support_tickets ENABLE TRIGGER set_support_tickets_updated_at;

-- ---------------------------------------------------------------------------
-- 6. Inbox counts
-- ---------------------------------------------------------------------------
--
-- One call for every tab on the Admin inbox. status is compared as text, the
-- same convention as 20261026090000, so the function never depends on enum
-- order.
CREATE OR REPLACE FUNCTION support_ticket_queue_counts(p_actor uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'new',         COUNT(*) FILTER (WHERE t.status::text = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE t.status::text = 'in_progress'),
    'waiting',     COUNT(*) FILTER (WHERE t.status::text = 'waiting_on_student'),
    'to_confirm',  COUNT(*) FILTER (WHERE t.status::text = 'awaiting_confirmation'),
    'closed',      COUNT(*) FILTER (WHERE t.status::text IN ('closed', 'resolved')),
    'all',         COUNT(*),
    'mine',        COUNT(*) FILTER (
                     WHERE p_actor IS NOT NULL
                       AND t.assigned_to = p_actor
                       AND t.status::text IN ('open', 'in_progress')
                   ),
    'unread',      COUNT(*) FILTER (
                     WHERE t.last_reply_by = 'student'
                       AND t.status::text NOT IN ('closed', 'resolved')
                       AND COALESCE(t.staff_seen_at, 'epoch'::timestamptz) < t.last_reply_at
                   )
  )
  FROM support_tickets t;
$$;

REVOKE ALL ON FUNCTION support_ticket_queue_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION support_ticket_queue_counts(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
