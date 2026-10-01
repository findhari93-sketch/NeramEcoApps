-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success.
--
-- pad_result: the teacher published an Answer Pad round's results, and this
--   student gets their own score (a Teams chat from Neram Assistant, and always
--   the bell).

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'pad_result';

NOTIFY pgrst, 'reload schema';
