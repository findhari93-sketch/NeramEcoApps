-- ============================================
-- NOTIFICATION EVENT TYPE: catch-up journey
--
-- sendNudge always writes an in-app row to user_notifications, whose event_type
-- is the enum notification_event_type. A value missing from the enum makes that
-- insert throw and be swallowed, so the student's bell stays empty while the
-- sender sees success (see 20260721100000 for the last time this bit us).
--
--   catchup_behind_pace  the weekly nudge when a student slips behind quota
--   catchup_completed    the backlog is cleared, in-app celebration only
--
-- Additive + idempotent. ADD VALUE IF NOT EXISTS is safe to re-run, and must
-- live in its own migration file (see 20260728090000).
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_behind_pace';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_completed';
