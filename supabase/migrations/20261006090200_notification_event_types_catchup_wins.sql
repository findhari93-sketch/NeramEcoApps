-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success.
--
-- catchup_item_cleared: a student just cleared a missed class (Neram Assistant).
-- catchup_all_clear:    a student has nothing left to catch up on.
-- catchup_note:         a teacher's personal note of congratulation.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_item_cleared';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_all_clear';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_note';

NOTIFY pgrst, 'reload schema';
