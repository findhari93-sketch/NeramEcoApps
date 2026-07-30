-- ============================================
-- CATCH-UP FOR A CLASS YOU MISSED
--
-- nexus_class_absences already records who missed which class, and already
-- carries the three things that clear one (watched, assignment, test passed).
-- What was missing was never schema: every read keyed on journey_id, which only
-- a late joiner ever gets, so an ordinary absence was invisible to the catch-up
-- screens even though its row was sitting right there.
--
-- That fix is in the query layer. All this migration adds is the index those
-- reads need, and the two notification events the new crons raise.
-- ============================================

-- 1. The teacher roll-up ------------------------------------------------------

-- "Everyone in this classroom with something still outstanding", which is the
-- single query behind /teacher/catch-up. Partial on caught_up_at because a
-- cleared row is never in that list, and the cleared rows are the ones that
-- accumulate forever.
CREATE INDEX IF NOT EXISTS idx_class_absences_classroom_open
  ON nexus_class_absences(classroom_id, student_id)
  WHERE caught_up_at IS NULL;

-- 2. Two new notification events ---------------------------------------------

-- recap_draft_ready  the auto-draft cron has turned a recorded class into a
--                    draft recap; a teacher needs to review and publish it.
-- catchup_overdue    a student has passed the deadline on a class they missed.
--
-- Re-declared in full rather than patched, matching every other migration that
-- has widened this constraint.
ALTER TABLE nexus_timetable_notifications
  DROP CONSTRAINT IF EXISTS nexus_timetable_notifications_event_type_check;
ALTER TABLE nexus_timetable_notifications
  ADD CONSTRAINT nexus_timetable_notifications_event_type_check
  CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted',
    'assignment_published',
    'assignment_reviewed',
    'assignment_nudge',
    'week_published',
    'class_missed_followup',
    'absence_reason_needed',
    'catchup_needs_attention',
    'catchup_no_recording',
    'recap_draft_ready',
    'catchup_overdue'
  ));

-- PostgREST caches the schema. Without this, the first insert of a new event
-- type fails on a constraint that has already been widened.
NOTIFY pgrst, 'reload schema';
