-- Notification types for the test reopen flow.
--
-- The flow itself works without these: every write that uses them is wrapped so
-- an environment that has not run this migration loses the bell entry and
-- nothing else. A teacher's approval still opens the door.
--
-- ADD VALUE IF NOT EXISTS is idempotent, so this is safe to re-run and safe to
-- apply to prod and staging in either order. Both environments carried an
-- identical notification_event_type when this was written.
--
-- Deliberately NOT reusing exam_makeup_granted for the grant. That value means
-- "the invigilation roster scheduled you a different sitting", which is a
-- different event from "your teacher let you back into the one you missed", and
-- the bell's navigation switch keys off the type to decide where to send the
-- reader.

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_granted';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'test_access_declined';

NOTIFY pgrst, 'reload schema';
