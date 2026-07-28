-- ============================================
-- NOTIFICATION EVENT TYPES: parent portal
-- The parent portal sends a weekly digest and a "something slipped" alert, and
-- records when a parent explains an absence on their child's behalf. Each lands
-- as an in-app row in `user_notifications`, whose `event_type` column is the
-- enum `notification_event_type`. Without these values a raw insert throws and
-- the notification is silently lost.
--
-- Isolated in its own migration (like 20260721100000_notification_event_type_nudge
-- and 20260721120100_notification_event_type_assignment_reviewed) because
-- ALTER TYPE ADD VALUE cannot share a transaction with code that USES the new
-- value. Additive and idempotent.
-- ============================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'parent_weekly_digest';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'parent_slip_alert';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'parent_absence_reason';

-- PostgREST caches the enum alongside the schema. Without this, an insert using
-- one of the new values keeps failing until the cache happens to refresh.
NOTIFY pgrst, 'reload schema';
