-- Teacher-initiated "Share this class" card in Teams.
--
-- Distinct from BOTH existing cards on a class row:
--   teams_channel_message_id   the join card, posted when the meeting is created
--   teams_wrapup_message_id    the "what we covered" card, posted on wrap-up save
--   teams_share_message_id     THIS one, posted only when a teacher taps Share
--
-- Three reasons it needs its own columns rather than reusing either:
--
-- 1. Cancellation cleanup. removeTeamsAnnouncements soft-deletes the join card so
--    a called-off class stops advertising itself. A share card left behind does
--    exactly what that function exists to prevent, so it has to be findable.
-- 2. The "shared 12 minutes ago" note in the dialog, which is what turns a second
--    tap from an accident into a decision.
-- 3. Attribution. The wrap-up card is posted by whoever saved the wrap-up; a share
--    is a deliberate act by a named person, and when a class group asks who sent
--    that message there should be an answer.
--
-- Deliberately NO hash column, unlike teams_wrapup_hash. That one exists because
-- refreshClassAnnouncement fires automatically on every wrap-up save and five
-- saves must not become five cards. Sharing is a human tapping a button, and a
-- teacher re-sharing after attaching an assignment MUST get a second card.

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS teams_share_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_share_chat_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_share_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teams_share_posted_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN nexus_scheduled_classes.teams_share_message_id IS
  'Channel message carrying the teacher-shared class card. Separate from teams_channel_message_id (join card) and teams_wrapup_message_id (wrap-up card) so cancellation cleanup can remove all three independently.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_share_chat_message_id IS
  'Group-chat twin of teams_share_message_id. Chats have no replies, so a share always posts fresh rather than threading.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_share_posted_at IS
  'When Share last reached Teams. Drives the "shared N minutes ago" note, so a second tap is a decision rather than an accident.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_share_posted_by IS
  'Which staff user tapped Share. NULL once that user is deleted; the card itself survives in Teams either way.';

NOTIFY pgrst, 'reload schema';
