-- Ask aiArchitek: the chat inside the Tools app (app.neramclasses.com/ask).
-- Written only by apps/app/src/app/api/ask/* through
-- packages/database/src/queries/ask.ts, with the service role.
--
-- A conversation belongs to a signed-in student (user_id) or to a guest
-- (anon_id, the neram_ask_anon cookie). When a guest signs in, their threads
-- and remembered details move to the account (claimAskGuestData).
--
-- Guests get three answers a day (India time). The count reads ask_messages
-- by anon_id, so anon_id is copied onto each message rather than joined.

CREATE TABLE IF NOT EXISTS ask_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anon_id text,
  title text,
  -- The tool page the chat was opened from ("Ask about this result").
  page_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CONSTRAINT ask_threads_owner CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ask_threads_user_recent
  ON ask_threads (user_id, last_message_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ask_threads_anon
  ON ask_threads (anon_id) WHERE anon_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ask_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES ask_threads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anon_id text,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL DEFAULT '',
  -- The cards shown with the answer: data from the tools, never from the model.
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb,
  model text,
  error text,
  response_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_messages_thread
  ON ask_messages (thread_id, created_at);
-- The guest daily quota: answered messages for one anon_id since midnight IST.
CREATE INDEX IF NOT EXISTS idx_ask_messages_guest_quota
  ON ask_messages (anon_id, created_at)
  WHERE role = 'assistant' AND anon_id IS NOT NULL AND user_id IS NULL;
-- Admin reads the newest conversations first.
CREATE INDEX IF NOT EXISTS idx_ask_messages_recent
  ON ask_messages (created_at DESC);

-- What the chat remembers about a student: board, marks, NATA attempts,
-- state, community, exam year, cities, budget. Shown to the student as an
-- editable "Your details" strip, so nothing here is hidden from them.
CREATE TABLE IF NOT EXISTS ask_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  anon_id text UNIQUE,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ask_memory_owner CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

ALTER TABLE ask_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_memory ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
