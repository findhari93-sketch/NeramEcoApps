-- A student querying their own exam result raises an ordinary ticket, so it
-- inherits the ticket number, the staff inbox, the activity log and auto-close
-- rather than growing a second half-built queue beside them.
--
-- `context` holds the working behind the result: which attempt was counted, the
-- marks as stored, the rank and its sitting, the pass bar then and now, and the
-- student's other attempts on the same paper. It is staff-facing, like
-- console_logs and device_info, and it exists so "my percentage is wrong" can be
-- answered from the ticket instead of from a database session.

ALTER TABLE nexus_foundation_issues DROP CONSTRAINT IF EXISTS nexus_foundation_issues_category_check;

ALTER TABLE nexus_foundation_issues
  ADD CONSTRAINT nexus_foundation_issues_category_check
  CHECK (category IN ('bug', 'content_issue', 'ui_ux', 'feature_request', 'class_schedule', 'result_dispute', 'other'));

ALTER TABLE nexus_foundation_issues ADD COLUMN IF NOT EXISTS context jsonb;

COMMENT ON COLUMN nexus_foundation_issues.context IS
  'Staff-facing facts captured when the ticket was raised. For result_dispute: the counted attempt, marks, rank, sitting, pass bar and other attempts.';

NOTIFY pgrst, 'reload schema';
