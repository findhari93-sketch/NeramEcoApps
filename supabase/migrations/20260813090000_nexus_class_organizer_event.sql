-- Record whether the class is on the SCHEDULING TEACHER'S OWN calendar.
--
-- Why a second column: teams_calendar_event_id was being asked two different
-- questions and could only answer one. Its own migration defines it as "an
-- Outlook OR GROUP calendar event id", and for a channel meeting the create
-- route writes the group event id into it. That is a true answer to "does a
-- calendar entry exist". It is the wrong answer to "will the tutor see this in
-- their calendar", because a group calendar event lives in the M365 group's
-- mailbox, not the teacher's, and the create path deliberately strips the
-- organizer out of the attendee list (they are the organizer, so they are not
-- invited). Teams desktop and Outlook do not render group calendars in the
-- personal view, so the tutor who scheduled the class could not see it.
--
-- The repair action and the class panel were both reading
-- teams_calendar_event_id to answer the second question, so for every
-- Nexus-created channel meeting they concluded "already on the calendar,
-- nothing to fix" and the Fix calendar invites button could never fire.
--
-- teams_organizer_event_id answers only the second question: an event id in the
-- scheduling teacher's own mailbox, or NULL when there is nothing there.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_organizer_event_id TEXT;

COMMENT ON COLUMN nexus_scheduled_classes.teams_organizer_event_id IS
  'Outlook event id of the copy in the scheduling teacher''s own mailbox. NULL means the class exists in Teams but is not on the tutor''s personal calendar, which is what the repair action fixes. Distinct from teams_calendar_event_id, which may point at a group mailbox event nobody sees in their personal calendar view.';

-- Backfill only what is certain. A row whose teams_calendar_event_id came from
-- /me/events genuinely IS in the organizer's mailbox, and the tell is that it
-- differs from teams_meeting_id: the group-calendar path stores the same id in
-- both, while the personal path creates the meeting and the event separately.
-- Rows where the two match are group events and are correctly left NULL.
UPDATE nexus_scheduled_classes
SET teams_organizer_event_id = teams_calendar_event_id
WHERE teams_organizer_event_id IS NULL
  AND teams_calendar_event_id IS NOT NULL
  AND teams_calendar_event_id IS DISTINCT FROM teams_meeting_id;

CREATE INDEX IF NOT EXISTS idx_scheduled_classes_missing_organizer_event
  ON nexus_scheduled_classes(classroom_id, scheduled_date)
  WHERE teams_meeting_id IS NOT NULL AND teams_organizer_event_id IS NULL;

NOTIFY pgrst, 'reload schema';
