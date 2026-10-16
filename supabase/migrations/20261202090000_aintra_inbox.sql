-- Aintra Inbox (Admin): who chatted, where they came from, and the review trail.
--
-- chatbot_conversations gains:
--   anonymous_id   the neram_anon_id cookie, so a guest's visits link up across sessions
--   device         "Android · Chrome", parsed from the user agent on the server
--   channel        last-touch channel (same words as Leads by channel)
--   landing_page   first page of the visit
--   ai_review      the saved AI Review {verdict, reasoning, suggestedCorrection, reviewedAt, model}
--   corrected_by / corrected_by_name / corrected_at   who saved a correction, and when
--
-- aintra_signup_nudges: a guest staff asked to sign up. The marketing chat adds a
-- sign-up card to that visitor's next answer and stamps shown_at.

ALTER TABLE public.chatbot_conversations
  ADD COLUMN IF NOT EXISTS anonymous_id TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS ai_review JSONB,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corrected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_anonymous_id
  ON public.chatbot_conversations (anonymous_id, created_at DESC)
  WHERE anonymous_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.aintra_signup_nudges (
  anonymous_id TEXT PRIMARY KEY,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shown_at TIMESTAMPTZ,
  shown_session_id TEXT
);

ALTER TABLE public.aintra_signup_nudges ENABLE ROW LEVEL SECURITY;

-- Server routes only (admin + marketing use the service role). No anon or
-- authenticated access: the anonymous id is the only key and must not be listable.
DROP POLICY IF EXISTS "Service role manages aintra_signup_nudges" ON public.aintra_signup_nudges;
CREATE POLICY "Service role manages aintra_signup_nudges"
  ON public.aintra_signup_nudges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.aintra_signup_nudges FROM anon, authenticated;
GRANT ALL ON public.aintra_signup_nudges TO service_role;
