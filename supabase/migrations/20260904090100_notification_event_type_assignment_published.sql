-- ============================================
-- NOTIFICATION EVENT TYPE: assignment published / linked
--
-- The top-bar bell (user_notifications) is the one a student sees on every
-- page; nexus_timetable_notifications is only rendered inside a classroom's
-- timetable. Publishing an assignment wrote to the second and not the first,
-- which is a large part of why students never noticed new work.
--
-- user_notifications.event_type is the notification_event_type ENUM, which had
-- 'assignment_nudge' and 'assignment_reviewed' but neither of the values the
-- publish/link announcement needs. A raw insert with a missing enum value
-- throws, and these inserts are best-effort, so it would have been swallowed.
--
-- Isolated in its own migration (like
-- 20260721120100_notification_event_type_assignment_reviewed) because
-- ALTER TYPE ADD VALUE cannot share a transaction with code that uses the new
-- value. Additive + idempotent.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'assignment_published';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'assignment_linked';
