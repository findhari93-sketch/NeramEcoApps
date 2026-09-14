-- Class notices on the main Nexus bell.
--
-- Class moved, class cancelled, test scheduled, a missed class to explain and the
-- rest used to reach only the timetable page's own bell (nexus_timetable_notifications)
-- plus a Teams activity ping. They now go through sendNudge like every other
-- student message (a Teams chat from the teacher, the feed as fallback, and the
-- main bell), so the main bell's enum needs their event types.
--
-- Isolated in its own migration: ALTER TYPE ADD VALUE cannot share a transaction
-- with code that uses the new value.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'class_cancelled';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'class_rescheduled';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'class_created';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'recording_available';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'week_published';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'absence_reason_needed';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_scheduled';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_granted';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_declined';
-- The daily staff catch-up digest has inserted this since it was built, but the
-- value never existed on production, so every digest insert failed and no
-- teacher ever received one.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_digest';

NOTIFY pgrst, 'reload schema';
