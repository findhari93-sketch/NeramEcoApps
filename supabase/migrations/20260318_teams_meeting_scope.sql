-- Add teams_meeting_scope to nexus_scheduled_classes
-- Tracks how the Teams meeting was created: link_only, channel_meeting, or calendar_event
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_meeting_scope TEXT
  CHECK (teams_meeting_scope IN ('link_only', 'channel_meeting', 'calendar_event'));
