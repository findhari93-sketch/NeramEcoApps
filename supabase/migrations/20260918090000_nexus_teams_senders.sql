-- Automatic Teams chats sent as a teacher who connected once.
--
-- Founder decision, 2026-09-14. A Teams 1:1 chat message can only be posted by a
-- signed-in person. Manual messages already work that way (the teacher presses
-- Send). An 18:00 reminder has nobody signed in, so a teacher connects once from
-- Class rhythm: Nexus keeps a Microsoft refresh token that can read their profile
-- and send chats (Chat.ReadWrite, ChatMessage.Send), renews it daily, and the
-- reminder cron sends through the same sendTeamsChatMessage path as a manual send.
--
-- The refresh token is stored as issued, like nexus_youtube_credentials: it was
-- issued to a confidential client, so it cannot be redeemed without the app's
-- client secret, which is not in the database. Service role only (RLS, no policy).
--
-- nexus_classrooms.reminder_sender_id says whose Teams a classroom's automatic
-- reminders come from. Set when a teacher connects from that classroom.
--
-- Also removes the Neram Assistant bot conversation cache this replaces. The live
-- code (7db25b88) only touches it when TEAMS_BOT_ENABLED is set, which it never
-- was, so dropping it before the deploy is safe. The `bot` and `email` columns of
-- nexus_notification_deliveries are left in place on purpose: that same live code
-- still writes them, and they default to false, so dropping them now would break
-- receipts until the deploy. New code simply never sets them.

DROP TABLE IF EXISTS nexus_teams_bot_conversations;

CREATE TABLE IF NOT EXISTS nexus_teams_senders (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ms_oid text NOT NULL,
  display_name text,
  upn text,
  refresh_token text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz,
  last_used_at timestamptz,
  last_error text,
  revoked_at timestamptz
);

ALTER TABLE nexus_teams_senders ENABLE ROW LEVEL SECURITY;

ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS reminder_sender_id uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN nexus_classrooms.reminder_sender_id IS
  'Teacher whose connected Teams account sends this classroom''s automatic reminders (nexus_teams_senders).';

NOTIFY pgrst, 'reload schema';
