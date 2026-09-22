-- ALONE IN THIS FILE, deliberately. Postgres refuses to use an enum value in the
-- same transaction that adds it, and supabase-js returns the insert error rather
-- than throwing, so a missing value fails the bell row silently while the sender
-- still reports success.
--
-- qb_solution_reported: a student reported a mistake in a question's solution
--   (to the teacher who uploaded the paper, on the first report only).
-- qb_report_resolved: staff fixed it, or checked and found no mistake (to each
--   student who reported it).

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'qb_solution_reported';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'qb_report_resolved';

NOTIFY pgrst, 'reload schema';
