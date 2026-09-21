-- The Neram Assistant's 1:1 conversation with each person, so a message the
-- system decided can arrive as a Teams chat without borrowing a teacher's login.
--
-- A scheduled job, and a Publish button, cannot post a Teams chat AS a person
-- without that person's signed-in token. Borrowing one is how exam results went
-- out from the founder's personal chat. A bot can post into its own 1:1 chat:
-- once the Neram Assistant app is installed for a user, Graph returns that chat
-- id and the Bot Connector posts into it. Resolving the id costs up to three
-- Graph calls, so it is cached here.
--
-- This replaces nexus_teams_bot_conversations, which was created by
-- 20260916090100 and dropped unused by 20260918090000 when automatic reminders
-- were pointed at a named teacher instead. That decision still stands for a
-- teacher talking to a student; it never fitted the system's own messages.
--
-- source 'graph_install_chat'   resolved via installedApps/{id}/chat
-- source 'conversation_update'  captured when Teams told the bot it was added
--
-- Written only by apps/nexus/src/lib/teams-assistant.ts and the bot endpoint.

CREATE TABLE IF NOT EXISTS nexus_teams_assistant_conversations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ms_oid text NOT NULL,
  conversation_id text NOT NULL,
  service_url text NOT NULL,
  tenant_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('graph_install_chat', 'conversation_update')),
  last_sent_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ntac_ms_oid ON nexus_teams_assistant_conversations (ms_oid);

-- Service role only: a student has no reason to read anyone's conversation id,
-- their own included.
ALTER TABLE nexus_teams_assistant_conversations ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
