-- Add last_synced_at to nexus_classrooms for rate-limiting on-page-load sync
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Prevent duplicate classes per Teams meeting per classroom
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_classes_meeting_classroom
ON nexus_scheduled_classes (teams_meeting_id, classroom_id)
WHERE teams_meeting_id IS NOT NULL;
