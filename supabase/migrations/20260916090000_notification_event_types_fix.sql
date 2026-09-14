-- Event types that code already sends but the enum never had.
--
-- scorecard_reminder, exam_date_reminder and scorecard_released were inserted
-- into user_notifications under a `type` column that does not exist, with values
-- the enum did not allow. supabase-js returns errors rather than throwing, so the
-- three routes never noticed and those notifications have never been delivered.
-- They now go through sendNudge, which needs the values to exist.
--
-- sketch_digest is the teacher's evening sketchbook digest.
--
-- Isolated in its own migration: ALTER TYPE ADD VALUE cannot share a transaction
-- with code that uses the new value.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scorecard_reminder';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'exam_date_reminder';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'scorecard_released';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_digest';

NOTIFY pgrst, 'reload schema';
