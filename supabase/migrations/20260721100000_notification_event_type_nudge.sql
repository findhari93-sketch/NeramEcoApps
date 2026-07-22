-- ============================================
-- NOTIFICATION EVENT TYPE: assignment / study-material nudge
-- The assignment "Message students" flow and the study-material nudge flow both
-- fall back to an in-app row in `user_notifications`, whose `event_type` column
-- is the enum `notification_event_type`. Those two values were never added to the
-- enum (the earlier assignments-space migration only widened a CHECK constraint on
-- the unrelated `nexus_timetable_notifications` table), so every fallback insert
-- threw `invalid input value for enum notification_event_type` and was silently
-- swallowed: the student's bell stayed empty while the teacher saw a false success.
--
-- Additive + idempotent. `ADD VALUE IF NOT EXISTS` is safe to re-run.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'assignment_nudge';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'study_material_nudge';
