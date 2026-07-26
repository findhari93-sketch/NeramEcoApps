-- Teams attendance sync: organizer identity, resolved meeting id, observability.
--
-- Teams attendance has never once been retrieved in production. Three reasons
-- live in this table:
--
--  1. Nothing recorded WHO organized the meeting in Graph's eyes. App-only
--     artifact reads are addressed as /users/{oid}/onlineMeetings, so the
--     organizer's oid, not teacher_id, is what makes attendance readable.
--     teacher_id is NULL on 89 of 106 meeting-bearing classes anyway.
--  2. Nothing recorded WHY a sync produced nothing, so a missing Azure grant
--     looked identical to a meeting that had not happened yet.
--  3. organizer_email and meeting_group_id are already SELECTed by shipped code
--     but were never applied to production (migration drift skipped
--     20260725000000 and 20260726130000 while applying later ones). PostgREST
--     errors on an unknown column, so every attendance sync, recording sync, and
--     multi-classroom class create currently fails before reaching Graph. These
--     are re-declared idempotently here so this migration is self-sufficient.

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS organizer_email TEXT,
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID,
  ADD COLUMN IF NOT EXISTS organizer_ms_oid TEXT,
  ADD COLUMN IF NOT EXISTS online_meeting_id TEXT,
  ADD COLUMN IF NOT EXISTS attendance_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS attendance_sync_detail TEXT,
  ADD COLUMN IF NOT EXISTS attendance_sync_attempts SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN nexus_scheduled_classes.organizer_ms_oid IS
  'AAD object id of the real Graph meeting organizer, normally read from the Oid in the join URL context param. This, not teacher_id, is what app-only attendance reads are addressed against.';
COMMENT ON COLUMN nexus_scheduled_classes.online_meeting_id IS
  'Resolved Graph onlineMeeting id. Distinct from teams_meeting_id, which for a channel meeting holds an Outlook event id (AAMk...). Cached so later syncs skip the joinWebUrl lookup.';
COMMENT ON COLUMN nexus_scheduled_classes.attendance_sync_status IS
  'Outcome of the last Teams attendance sync: ok, or one of no_meeting_linked, no_organizer, meeting_not_found, app_permission_missing, access_policy_missing, report_not_ready, no_records, graph_error.';
COMMENT ON COLUMN nexus_scheduled_classes.attendance_sync_detail IS
  'Raw Graph status and truncated body from the last failure, for operators.';
COMMENT ON COLUMN nexus_scheduled_classes.attendance_sync_attempts IS
  'Failed sync attempts. The cron gives up past a threshold so a permanently missing report stops costing Graph calls.';

-- Drives the cron's candidate scan. Partial, so a class leaves the index once synced.
CREATE INDEX IF NOT EXISTS idx_sched_attendance_pending
  ON nexus_scheduled_classes (scheduled_date DESC, end_time)
  WHERE teams_meeting_id IS NOT NULL AND attendance_synced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sched_meeting_group
  ON nexus_scheduled_classes (meeting_group_id)
  WHERE meeting_group_id IS NOT NULL;

-- Backfill the organizer straight out of the join URL. Teams stamps the
-- organizer's Oid into the URL at creation time, so this needs no Graph call.
-- Handles both the percent-encoded form (what production actually stores) and
-- the decoded form.
UPDATE nexus_scheduled_classes
SET organizer_ms_oid = (
  regexp_match(
    teams_meeting_join_url,
    'Oid(?:%22|")(?:%3[aA]|:)(?:%22|")([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
  )
)[1]
WHERE organizer_ms_oid IS NULL
  AND teams_meeting_join_url IS NOT NULL
  AND teams_meeting_join_url LIKE '%Oid%';

-- Audit trail for manual marks. /api/attendance already selects, orders by, and
-- inserts both of these columns even though neither existed, so this also fixes
-- a live failure on that route. It matters more now that any teacher or admin can
-- mark attendance on any class, not just the enrolled teacher.
ALTER TABLE nexus_attendance
  ADD COLUMN IF NOT EXISTS marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;

COMMENT ON COLUMN nexus_attendance.marked_by IS
  'Staff user who last set this row by hand. NULL for rows written by the Teams sync.';
