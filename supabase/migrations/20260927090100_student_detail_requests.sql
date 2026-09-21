-- One request for a student to fill in their own application details.
--
-- WHY THIS EXISTS. 28 enrolled students have no application form at all, and only 1
-- of them has a phone number on file while only 7 have ever opened Nexus. Staff
-- could not reach them through the app, and the only tool they had was a button that
-- copied four questions to the clipboard for someone to paste into WhatsApp and then
-- retype into Admin. This table backs a link instead: staff copy it, the student
-- opens it with no login, and their answers save themselves.
--
-- WHY THE TOKEN IS UNSIGNED. A signed stateless token cannot be withdrawn. These
-- links travel through WhatsApp and get forwarded, so the row has to stay the
-- authority: cancelling it must kill the link immediately. Same reasoning, and the
-- same shape, as direct_enrollment_links (20260308000000).

-- Written to re-run safely. This table reached production out of band, before its
-- version was ever recorded in schema_migrations, so `supabase db push` still counts
-- it as pending and replays it on every deploy. Unguarded, the replay raises
-- "relation already exists", and because the CLI stops at the first failure, every
-- LATER migration is skipped too. Guarding it costs nothing and keeps one stale row
-- in a bookkeeping table from silently holding back the rest of the queue.
DO $$
BEGIN
  CREATE TYPE public.student_detail_request_status AS ENUM (
    'active',     -- open and usable
    'answered',   -- the student submitted at least once; still editable until it expires
    'expired',    -- past expires_at; set lazily on read, never by a cron
    'cancelled'   -- withdrawn by staff, or superseded by a regenerated link
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.student_detail_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 32 random bytes, base64url. Longer than the direct-enrollment link's 16 because
  -- this one lives for a fortnight in a chat thread.
  token            text NOT NULL,
  status           public.student_detail_request_status NOT NULL DEFAULT 'active',
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  -- When staff copied the link. Not proof it was sent, only that it left the screen,
  -- which is the most an app can honestly claim about a WhatsApp message.
  sent_at          timestamptz,
  sent_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  opened_at        timestamptz,  -- first time the student loaded the page
  answered_at      timestamptz,  -- first successful submit; never moves again
  updated_at       timestamptz,  -- a later edit by the same student
  lead_profile_id  uuid REFERENCES public.lead_profiles(id) ON DELETE SET NULL,
  open_count       integer NOT NULL DEFAULT 0,
  cancelled_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS student_detail_requests_token_key
  ON public.student_detail_requests (token);

CREATE INDEX IF NOT EXISTS student_detail_requests_user_idx
  ON public.student_detail_requests (user_id, status);

-- At most one live request per student, so a student never holds two working links
-- and staff never wonder which one they sent. The regenerate path must cancel the
-- old row BEFORE inserting; it cannot insert-then-cancel.
--
-- Deliberately the only uniqueness rule on this table. A partial and a plain unique
-- index over the same column fight each other, which is how the placement tables
-- came to refuse legitimate writes.
CREATE UNIQUE INDEX IF NOT EXISTS student_detail_requests_one_active
  ON public.student_detail_requests (user_id)
  WHERE status = 'active';

ALTER TABLE public.student_detail_requests ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: service-role only, default deny. The token is the only key
-- to this data and it is checked in the route, never by RLS, because the student who
-- opens the link is not signed in and so has no Postgres identity to match on.
-- Same posture as nexus_application_form_dismissals (20260911120000).

COMMENT ON TABLE public.student_detail_requests IS
  'A link asking one student to fill in their own application details. The row is the authority: cancelling it kills the link. Answers land in lead_profiles/users, not here.';
COMMENT ON COLUMN public.student_detail_requests.sent_at IS
  'When staff copied the link, which is the most that can honestly be claimed about a message sent by hand through WhatsApp.';
COMMENT ON COLUMN public.student_detail_requests.answered_at IS
  'First successful submit. Stays put on later edits so "how long did they take" keeps its meaning; updated_at moves instead.';
