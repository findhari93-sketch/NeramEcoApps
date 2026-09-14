-- The Neram Assistant bot's 1:1 conversation with each person, so an automated
-- reminder can arrive as a Teams chat.
--
-- A scheduled job cannot post a Teams chat as a teacher (that needs the teacher's
-- own signed-in token). A bot can: once the Neram Assistant app (with its bot) is
-- installed for a user, Graph returns the 1:1 chat id and the Bot Connector posts
-- into it. Resolving that id costs three Graph calls, so it is cached here.
--
-- source 'graph_install_chat'   resolved via installedApps/{id}/chat
-- source 'conversation_update'  captured when Teams told the bot it was added
--
-- Written only by apps/nexus/src/lib/teams-bot.ts and the bot messaging endpoint.

CREATE TABLE IF NOT EXISTS nexus_teams_bot_conversations (
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

CREATE INDEX IF NOT EXISTS idx_ntbc_ms_oid ON nexus_teams_bot_conversations (ms_oid);

ALTER TABLE nexus_teams_bot_conversations ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
