-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success.
--
-- pad_nudge: the teacher pressed Nudge on a live Answer Pad question, and this
--   student had neither answered nor said why not (a Teams chat from the teacher
--   when their pad was closed, and always the bell).

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'pad_nudge';

NOTIFY pgrst, 'reload schema';
