-- Per-classroom Teams channel link. Under the "one Team per academic-year cohort,
-- one channel per classroom" model, a classroom shares its cohort's ms_team_id but
-- targets its own channel for scheduled-meeting announcements. NULL ms_channel_id =
-- fall back to the "Class Meeting Details" channel by name (then General), the
-- pre-existing behaviour.

ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS ms_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS ms_channel_name TEXT;

COMMENT ON COLUMN nexus_classrooms.ms_channel_id IS
  'Teams channel (thread id 19:...@thread.tacv2) inside ms_team_id that scheduled-meeting announcements for this classroom post to. NULL = fall back to the "Class Meeting Details" channel, then General.';
COMMENT ON COLUMN nexus_classrooms.ms_channel_name IS
  'Display name of the linked channel, for showing in the Nexus classroom Teams panel.';
