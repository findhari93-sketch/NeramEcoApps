-- Demo class: what Microsoft Teams saw, and the recording staff picked.
--
-- The admin cron (and a "Check Teams" button) reads the demo meeting's
-- attendance reports and the organizer's OneDrive Recordings folder. Teams
-- data only suggests: a person still confirms Attended or No-show, and picks
-- which recording belongs to the demo (a test run or a mis-click can leave
-- extra files). Machine-owned columns are refreshed on every check; the
-- picked recording and the attendance mark are never overwritten by a check.

ALTER TABLE demo_class_registrations
  ADD COLUMN IF NOT EXISTS teams_meeting_id TEXT,
  -- [{ name, email, role, staff, seconds, firstJoin, lastLeave }], one per person, all reports merged
  ADD COLUMN IF NOT EXISTS teams_attendance JSONB,
  ADD COLUMN IF NOT EXISTS teams_checked_at TIMESTAMPTZ,
  -- Why the last check could not read Teams (permissions, no meeting); null when it worked
  ADD COLUMN IF NOT EXISTS teams_check_note TEXT,
  -- [{ driveId, itemId, name, webUrl, createdAt, size, durationMs }], newest first
  ADD COLUMN IF NOT EXISTS recording_candidates JSONB,
  ADD COLUMN IF NOT EXISTS recording_drive_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_item_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_name TEXT,
  ADD COLUMN IF NOT EXISTS recording_web_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_picked_by UUID,
  ADD COLUMN IF NOT EXISTS recording_picked_at TIMESTAMPTZ;

COMMENT ON COLUMN demo_class_registrations.teams_attendance IS
  'Teams attendance per person for the demo meeting, merged across reports. Suggestion only; status stays a human decision.';
COMMENT ON COLUMN demo_class_registrations.recording_item_id IS
  'OneDrive driveItem id of the recording staff picked. Play through Graph; never store a download URL.';

-- The sweep looks for Teams demos that ended in the last week and were not checked recently.
CREATE INDEX IF NOT EXISTS idx_demo_registrations_teams_check
  ON demo_class_registrations (scheduled_start)
  WHERE graph_event_id IS NOT NULL;

-- ─── The demo decides itself ────────────────────────────────────────────
-- After the meeting, the check reads attendance and the transcript and marks
-- the demo: a student with the team for 15 minutes or more is Attended, a
-- team that waited alone is No-show, anything in between waits for a person.
-- A mark Teams made can be revised by later evidence; a mark staff made never is.

ALTER TABLE demo_class_registrations
  -- Who set the current Attended / No-show: 'teams' (automatic) or 'staff'. Null on older rows means staff.
  ADD COLUMN IF NOT EXISTS attendance_source TEXT CHECK (attendance_source IN ('teams', 'staff')),
  -- The last automatic reading: { kind: held | no_show | unclear, reason, together, guest, at }
  ADD COLUMN IF NOT EXISTS teams_verdict JSONB,
  -- Set once the demo's transcript is stored in demo_transcripts.
  ADD COLUMN IF NOT EXISTS transcript_found_at TIMESTAMPTZ;

-- Kept out of demo_class_registrations so the desk list (select *) stays small.
CREATE TABLE IF NOT EXISTS demo_transcripts (
  registration_id UUID PRIMARY KEY REFERENCES demo_class_registrations(id) ON DELETE CASCADE,
  vtt TEXT NOT NULL,
  -- { minutes, cues, speakers: [{ name, staff, words, seconds }], guestWords, staffWords }
  stats JSONB,
  transcript_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE demo_transcripts IS
  'Teams transcript of a demo class (WEBVTT), read by Admin with the service role only.';

ALTER TABLE demo_transcripts ENABLE ROW LEVEL SECURITY;
