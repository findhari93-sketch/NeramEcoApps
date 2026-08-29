-- ============================================
-- ASSIGNMENT ANNOUNCEMENTS: Teams channel + group chat
--
-- Publishing an assignment used to write exactly one row into
-- nexus_timetable_notifications (the per-classroom timetable bell) and nothing
-- else. Students never found out: the bell is a screen they have to go looking
-- at, while a scheduled class already announces itself in the Teams group chat
-- and channel where they actually are.
--
-- This adds the storage an assignment needs to announce itself the same way:
--   1. A per-classroom "Assignment Channel", kept SEPARATE from the meeting
--      channel so assignment cards never mix into the class-meeting feed.
--      Unset means "post to the group chat only", which is the deliberate
--      default for a classroom nobody has configured yet.
--   2. Teams message refs on the assignment row, mirroring the columns already
--      on nexus_scheduled_classes, so a later edit/soft-delete path has what it
--      needs and, today, so the announce-once guard has somewhere to record
--      that a card was posted.
--   3. 'assignment_linked' on the timetable bell's event_type CHECK.
--
-- Additive and idempotent.
-- ============================================

-- 1. Where assignment cards get posted, per classroom.
--    Deliberately not reusing ms_channel_id: that one is the meeting channel,
--    and a teacher who points assignments elsewhere must not have their class
--    "Join Meeting" cards follow along.
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS ms_assignment_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS ms_assignment_channel_name TEXT;

COMMENT ON COLUMN nexus_classrooms.ms_assignment_channel_id IS
  'Teams channel id that assignment cards post to. NULL means group chat only.';

-- 2. What was posted, and for which class.
--    teams_announced_at is the announce-once marker for the publish card;
--    teams_announced_class_id is the same for the "linked to this class" card,
--    so unlinking and relinking cannot re-announce the same pairing.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS teams_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_channel_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_group_chat_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_announced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teams_announced_class_id UUID;

COMMENT ON COLUMN nexus_class_assignments.teams_announced_class_id IS
  'The scheduled class this assignment was last announced against. Guards against a relink re-posting the same card.';

-- 3. The timetable bell needs to accept the new event.
--    Full list re-stated because the constraint is replaced wholesale; this is
--    the list from 20260901090100 plus 'assignment_linked'.
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
    'assignment_linked',
    'week_published',
    'class_missed_followup',
    'absence_reason_needed',
    'catchup_needs_attention',
    'catchup_no_recording',
    'recap_draft_ready',
    'catchup_overdue',
    'test_scheduled'
  ));
