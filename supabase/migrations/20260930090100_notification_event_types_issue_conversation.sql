-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success. catchup_digest was missing on production for months
-- exactly this way.
--
-- One comment event serves both directions, staff to student and student back.
-- getNavigationUrl reads metadata.href, so the same event type lands each side
-- on its own issues page.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_comment';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_recheck_requested';

NOTIFY pgrst, 'reload schema';
