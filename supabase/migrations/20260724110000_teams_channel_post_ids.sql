-- Track the Teams messages a scheduled class posts, so cancelling/deleting the
-- class can also remove its announcements. Before this, creating a meeting
-- posted to the "Class Meeting Details" channel (and the group chat) but threw
-- the response away, leaving the message ID unknown. With no ID, cancelling a
-- class deleted the meeting itself but left the channel/chat card behind forever.
--
-- All nullable and additive: existing rows keep working, and only meetings
-- created after this ships carry the IDs needed for automatic cleanup.
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_channel_id text,
  ADD COLUMN IF NOT EXISTS teams_channel_message_id text,
  ADD COLUMN IF NOT EXISTS teams_group_chat_message_id text;

COMMENT ON COLUMN nexus_scheduled_classes.teams_channel_id IS
  'ID of the Teams channel the meeting announcement was posted to (for softDelete on cancel).';
COMMENT ON COLUMN nexus_scheduled_classes.teams_channel_message_id IS
  'ID of the channel announcement message (for softDelete on cancel/delete).';
COMMENT ON COLUMN nexus_scheduled_classes.teams_group_chat_message_id IS
  'ID of the group-chat announcement message (for softDelete on cancel/delete).';
