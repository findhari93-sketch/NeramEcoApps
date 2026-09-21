-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success. catchup_digest was missing on production for months
-- exactly this way.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'result_dispute_raised';

NOTIFY pgrst, 'reload schema';
