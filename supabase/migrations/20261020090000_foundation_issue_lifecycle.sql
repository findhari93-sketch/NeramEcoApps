-- Support tickets get a lifecycle both sides can read.
--
-- Until now a ticket had one staff action, Resolve. Nobody could tell a student
-- "we have picked this up" or "we need more from you", and a ticket waiting on
-- the student looked exactly like one waiting on staff. This migration adds the
-- three things that lifecycle needs:
--
--   1. waiting_on_student, the status that says whose turn it is
--   2. resolution_code, how a ticket ended, for the student and for reporting
--   3. the activity actions that record each move in the thread
--
-- Every writer of the new values is new code, so the existing flows keep working
-- if the app lands before this file does. resolution_code is named in an update
-- only when a caller passes one, for the same reason.

-- ---------------------------------------------------------------------------
-- 1. Status: waiting_on_student.
-- ---------------------------------------------------------------------------
ALTER TABLE nexus_foundation_issues DROP CONSTRAINT IF EXISTS nexus_foundation_issues_status_check;
ALTER TABLE nexus_foundation_issues
  ADD CONSTRAINT nexus_foundation_issues_status_check
  CHECK (status IN (
    'open', 'in_progress', 'waiting_on_student', 'resolved', 'awaiting_confirmation', 'closed'
  ));

-- ---------------------------------------------------------------------------
-- 2. How a ticket ended.
-- ---------------------------------------------------------------------------
--
-- no_response is written by the auto-close cron only, when a ticket waiting on
-- the student hears nothing for 7 days. Staff pick one of the other five.
ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS resolution_code text;

ALTER TABLE nexus_foundation_issues DROP CONSTRAINT IF EXISTS nexus_foundation_issues_resolution_code_check;
ALTER TABLE nexus_foundation_issues
  ADD CONSTRAINT nexus_foundation_issues_resolution_code_check
  CHECK (resolution_code IS NULL OR resolution_code IN (
    'fixed', 'answered', 'not_a_bug', 'duplicate', 'wont_fix', 'no_response'
  ));

COMMENT ON COLUMN nexus_foundation_issues.resolution_code IS
  'How the ticket ended: fixed, answered, not_a_bug, duplicate, wont_fix, or no_response (auto-close only). Cleared on reopen.';

-- ---------------------------------------------------------------------------
-- 3. Activity actions.
-- ---------------------------------------------------------------------------
--
-- accepted already existed and now means "Start working".
--   info_requested   staff asked the student for more, status -> waiting_on_student
--   student_replied  the student answered, status -> in_progress on its own
--   closed_by_staff  staff closed without asking the student to confirm
ALTER TABLE nexus_foundation_issue_activity DROP CONSTRAINT IF EXISTS nexus_foundation_issue_activity_action_check;
ALTER TABLE nexus_foundation_issue_activity
  ADD CONSTRAINT nexus_foundation_issue_activity_action_check
  CHECK (action IN (
    'created', 'assigned', 'accepted', 'delegated', 'returned',
    'marked_in_progress', 'resolved', 'reopened', 'comment',
    'confirmed', 'auto_closed',
    'info_requested', 'student_replied', 'closed_by_staff'
  ));

-- ---------------------------------------------------------------------------
-- 4. Badge counts: a ticket waiting on the student is in the student's inbox.
-- ---------------------------------------------------------------------------
--
-- The staff inbox does NOT count it. Waiting on the student is not staff's turn,
-- and a badge nobody on staff can clear is a badge people learn to ignore.
CREATE OR REPLACE FUNCTION nexus_issue_badge_counts(p_user_id uuid, p_is_staff boolean)
RETURNS TABLE (inbox integer, unread integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE CASE WHEN p_is_staff
              THEN i.status IN ('open', 'in_progress')
              ELSE i.status IN ('open', 'in_progress', 'waiting_on_student', 'awaiting_confirmation')
            END
    )::int AS inbox,
    COUNT(*) FILTER (
      WHERE i.last_reply_at IS NOT NULL
        AND COALESCE(
              CASE WHEN p_is_staff THEN i.staff_seen_at ELSE i.student_seen_at END,
              'epoch'::timestamptz
            ) < i.last_reply_at
    )::int AS unread
  FROM nexus_foundation_issues i
  WHERE i.status <> 'closed'
    AND (p_is_staff OR i.student_id = p_user_id);
$$;

-- Same lock-down as 20260930090000: SECURITY DEFINER with p_is_staff as an
-- argument, so anon and authenticated are named explicitly, not just PUBLIC.
REVOKE ALL ON FUNCTION nexus_issue_badge_counts(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_issue_badge_counts(uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
