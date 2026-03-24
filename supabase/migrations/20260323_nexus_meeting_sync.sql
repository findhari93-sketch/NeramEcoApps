-- Add organizer_name to scheduled classes for Teams-imported meetings
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS organizer_name TEXT;
