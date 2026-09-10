-- ============================================
-- NOTIFICATION EVENT TYPES: acting on test results
--
-- Three events the results screen can now raise, all landing on the top-bar bell
-- (user_notifications.event_type, which is the notification_event_type ENUM):
--
--   test_result_message  a teacher wrote to selected students about one run
--   test_reopened        a teacher reopened the run for them, in bulk
--   test_regraded        a question's answer key was corrected and their stored
--                        score moved as a result
--
-- test_regraded is the one that matters most. Correcting a key changes a number
-- a student already saw, and a score that moves in silence is worse than one
-- that was wrong, so the re-grade always leaves a trail the student can read.
--
-- Deliberately NOT reusing test_access_granted for test_reopened: that value
-- means "your request was answered", and this one means "your teacher reopened
-- it without you asking". NotificationBell keys its navigation off the type.
--
-- Isolated in its own migration because ALTER TYPE ADD VALUE cannot share a
-- transaction with code that uses the new value. Additive and idempotent.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_result_message';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_reopened';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_regraded';

NOTIFY pgrst, 'reload schema';
