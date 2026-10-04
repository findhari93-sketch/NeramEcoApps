-- Neram Assistant conversations: one thread per person per channel, the
-- messages in it, and the actions the assistant proposed and the person
-- confirmed. Written only by apps/nexus/src/lib/assistant/store.ts.
--
-- flow_state holds a guided flow in progress ("which class can't you attend?")
-- so the next message can continue it; it is cleared when the flow ends and
-- ignored once stale (see lib/assistant/turn.ts).

CREATE TABLE IF NOT EXISTS nexus_assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('nexus', 'teams')),
  external_id text,
  title text,
  page_context jsonb,
  flow_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nat_user_channel_external
  ON nexus_assistant_threads (user_id, channel, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nat_user_recent
  ON nexus_assistant_threads (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS nexus_assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES nexus_assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL,
  mode text,
  llm boolean NOT NULL DEFAULT false,
  tool_calls jsonb,
  envelope jsonb,
  model text,
  prompt_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,6),
  external_id text,
  -- An assistant row names the user message it answers, so pairing never guesses by order.
  reply_to uuid REFERENCES nexus_assistant_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Teams redelivers an activity it thinks failed; the same activity id must
-- not become two user messages.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nam_thread_external
  ON nexus_assistant_messages (thread_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nam_thread_created
  ON nexus_assistant_messages (thread_id, created_at);

-- A resend from the Nexus panel carries the client's message id but may not
-- know its thread yet (the first reply was lost); this finds that thread.
CREATE INDEX IF NOT EXISTS idx_nam_external
  ON nexus_assistant_messages (external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS nexus_assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES nexus_assistant_threads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  args jsonb NOT NULL,
  summary text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirm_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'executed', 'failed', 'cancelled', 'expired')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_naa_user_status ON nexus_assistant_actions (user_id, status);

ALTER TABLE nexus_assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assistant_actions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
