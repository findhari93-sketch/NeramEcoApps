-- Record whether a class meeting actually produced a calendar entry, and where.
--
-- Why this is needed: teams_meeting_scope was being used as if it described the
-- result, but the create route also WRITES it on the failure path. When the
-- group-calendar POST returned 403 the route fell back to /me/onlineMeetings,
-- which produces a join link and no calendar item for anybody, then stamped the
-- row 'calendar_event'. The UI read that stamp and told the teacher "Calendar
-- invites" for a meeting nobody was ever invited to.
--
-- teams_calendar_event_id is the fact: an Outlook/group event id when a calendar
-- entry exists, NULL when the class only has a join link. teams_meeting_degraded
-- records that the preferred path failed, which until now survived only as a
-- transient snackbar.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_calendar_event_id TEXT;

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_meeting_degraded BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN nexus_scheduled_classes.teams_calendar_event_id IS
  'Outlook or group calendar event id. NULL means the class has a join link but no calendar entry, so nobody was invited.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_meeting_degraded IS
  'True when the preferred meeting path failed and a fallback was used. Drives the repair action in the class panel.';

-- Backfill what can be known for certain. Rows imported from the Teams calendar
-- by syncClassroomMeetings carry an Outlook event id in teams_meeting_id (AAMk /
-- AQMk prefixes), so those genuinely do have a calendar entry. Rows created via
-- /me/onlineMeetings carry a base64 meeting id and are left NULL, which is the
-- correct answer: they have no calendar entry.
UPDATE nexus_scheduled_classes
SET teams_calendar_event_id = teams_meeting_id
WHERE teams_calendar_event_id IS NULL
  AND teams_meeting_id IS NOT NULL
  AND (teams_meeting_id LIKE 'AAMk%' OR teams_meeting_id LIKE 'AQMk%');

CREATE INDEX IF NOT EXISTS idx_scheduled_classes_missing_calendar
  ON nexus_scheduled_classes(classroom_id, scheduled_date)
  WHERE teams_meeting_id IS NOT NULL AND teams_calendar_event_id IS NULL;

NOTIFY pgrst, 'reload schema';
