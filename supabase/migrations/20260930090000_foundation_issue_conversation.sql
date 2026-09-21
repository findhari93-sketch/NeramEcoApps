-- Support tickets become a two-way conversation.
--
-- Until now a ticket comment was a staff note in a drawer that reached nobody:
-- the composer lived only in /teacher/issues, the student page never fetched the
-- activity log, and nothing notified the reporter. This migration adds the two
-- things that conversation needs, a visibility rule and an unread mark.

-- ---------------------------------------------------------------------------
-- 1. Who an activity row is for.
-- ---------------------------------------------------------------------------
--
-- THE DEFAULT IS THE BACKFILL. Every comment written before this column existed
-- was a staff internal note, because no student could read one. NOT NULL DEFAULT
-- false fills all of them in a single statement, with no table rewrite on PG11+.
-- The shape that silently backfills nothing is ADD COLUMN ... DEFAULT true
-- followed by UPDATE ... WHERE visible_to_student IS NULL: the default has
-- already filled the column, so the UPDATE matches zero rows.
--
-- It also fails closed. A future writer that forgets this column produces an
-- internal row, which is a missing message. The other way round produces a
-- leaked one. Only the student-facing writers pass true, and they pass it
-- explicitly.
ALTER TABLE nexus_foundation_issue_activity
  ADD COLUMN IF NOT EXISTS visible_to_student boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN nexus_foundation_issue_activity.visible_to_student IS
  'True when the reporter may read this row. False (the default) is an internal staff note. Filtered SERVER SIDE in getIssueActivityLog, never merely hidden in the UI.';

-- ---------------------------------------------------------------------------
-- 2. Unread, as two stamps and a high-water mark on the ticket row.
-- ---------------------------------------------------------------------------
--
-- Denormalised onto the ticket on purpose. /api/nav-badges is polled every 60
-- seconds by every signed-in user for as long as Nexus is open, so its cost is
-- paid forever rather than once. A read stamp on the activity rows would force a
-- join or a group-by over the whole activity table on every one of those polls.
--
-- updated_at cannot stand in for last_reply_at: priority and assignment changes
-- bump it, and adding a comment does not.
ALTER TABLE nexus_foundation_issues
  ADD COLUMN IF NOT EXISTS last_reply_at   timestamptz,
  ADD COLUMN IF NOT EXISTS student_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_seen_at   timestamptz;

COMMENT ON COLUMN nexus_foundation_issues.last_reply_at IS
  'When the newest student-visible conversation row was written. Maintained by addIssueComment.';
COMMENT ON COLUMN nexus_foundation_issues.staff_seen_at IS
  'Shared across staff on purpose: the issues queue is a shared inbox, so one staff member reading a reply clears the dot for the team. A per-person stamp would need a reads table and a join on every badge poll.';

CREATE INDEX IF NOT EXISTS idx_foundation_issues_student_unread
  ON nexus_foundation_issues (student_id, last_reply_at)
  WHERE last_reply_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foundation_issues_staff_unread
  ON nexus_foundation_issues (last_reply_at)
  WHERE last_reply_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Both badge numbers in one round trip.
-- ---------------------------------------------------------------------------
--
-- An RPC because PostgREST cannot compare two columns: student_seen_at <
-- last_reply_at has no .filter() form. Same shape as count_pending_photo_reviews.
--
-- `inbox` counts tickets still in play, and for a student that now includes
-- awaiting_confirmation, the one state that is actually waiting on them and the
-- one the old head count left invisible.
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
              ELSE i.status IN ('open', 'in_progress', 'awaiting_confirmation')
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

-- anon and authenticated named EXPLICITLY, not just PUBLIC.
--
-- This function is SECURITY DEFINER and takes p_is_staff as an ARGUMENT, so any
-- role that can execute it can ask for the staff-wide numbers by passing true.
-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new public
-- functions to anon and authenticated, and those are direct grants that a
-- REVOKE ... FROM PUBLIC does not touch. Verified on staging: after the plain
-- REVOKE, has_function_privilege('authenticated', ...) was still true.
--
-- Only the service role calls this. /api/nav-badges uses the admin client and
-- decides p_is_staff itself, from the caller's own users row.
REVOKE ALL ON FUNCTION nexus_issue_badge_counts(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_issue_badge_counts(uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
