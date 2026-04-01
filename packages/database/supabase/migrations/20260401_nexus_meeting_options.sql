-- Add meeting options and recurrence support to nexus_scheduled_classes
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
  ADD COLUMN IF NOT EXISTS lobby_bypass TEXT DEFAULT 'organization',
  ADD COLUMN IF NOT EXISTS allowed_presenters TEXT DEFAULT 'organizer';

-- Index for efficient recurrence group queries (e.g. cancel all recurring instances)
CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_recurrence_group
  ON nexus_scheduled_classes(recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;
