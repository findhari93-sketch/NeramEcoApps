-- The event type for "please fill in your application details".
--
-- Alone in its own migration, and AFTER 20260927090100, for the usual reason:
-- ALTER TYPE ... ADD VALUE cannot share a transaction with code that uses the new
-- value, so sending a nudge with this event type before this has committed fails the
-- user_notifications insert. Same pattern as
-- 20260916090000_notification_event_types_fix.sql.
--
-- None of the 88 existing values fit. The nearest, assignment_nudge and
-- study_material_nudge, both deep-link into work inside a classroom; this one asks
-- for something about the student's own record and lands on their profile form.

ALTER TYPE public.notification_event_type ADD VALUE IF NOT EXISTS 'application_details_needed';
