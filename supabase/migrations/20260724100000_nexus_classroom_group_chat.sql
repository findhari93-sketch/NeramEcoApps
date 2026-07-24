-- Store the Microsoft Teams group-chat id per classroom so scheduled meetings can
-- be auto-announced into the class group chat (in addition to the channel).
-- The group chat is per-team, so it lives on the classroom, not in global settings.

ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS ms_group_chat_id TEXT;

COMMENT ON COLUMN nexus_classrooms.ms_group_chat_id IS
  'Microsoft Teams group-chat thread id (e.g. 19:xxxx@thread.v2). When set, POST /api/timetable/teams-meeting posts the meeting announcement to this chat using the teacher''s delegated ChatMessage.Send scope.';
