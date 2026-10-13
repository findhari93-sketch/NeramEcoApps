-- ============================================================================
-- Review requests: one link per past student, a verified review back.
--
-- WHY THIS EXISTS. The public review page shows nine templated testimonials that
-- nobody can vouch for. Staff now prefill what we already know about a student
-- (photo, exam, year, AIR or percentile, college, centre), send one link, and the
-- student adds a star rating and their own words, typed or spoken. The answer
-- lands in testimonials as a learner row, so the existing trigger keeps it hidden
-- and the existing moderation queue is where staff edit and publish it.
--
-- WHY THE TOKEN IS UNSIGNED. Same reasoning as student_detail_requests
-- (20260927090100): these links travel through WhatsApp and get forwarded, so the
-- row must stay the authority and cancelling it must kill the link at once.
--
-- Also on testimonials: the facts a verified review carries (percentile, centre),
-- the student's original words (never overwritten when staff edit), the voice
-- transcript, and who edited it.
--
-- Written to re-run safely (IF NOT EXISTS / duplicate_object guards), because
-- `supabase db push` replays anything missing from schema_migrations.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE public.review_request_status AS ENUM (
    'active',     -- sent or not yet sent, never opened
    'opened',     -- the student loaded the page at least once
    'submitted',  -- the student sent a review; still editable until staff moderate it
    'expired',    -- past expires_at; set lazily on read, never by a cron
    'cancelled'   -- withdrawn by staff, or superseded by a regenerated link
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.review_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text NOT NULL,
  status             public.review_request_status NOT NULL DEFAULT 'active',

  -- Who it is for. Both nullable: some past students never had a users row.
  user_id            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  student_result_id  uuid REFERENCES public.student_results(id) ON DELETE SET NULL,

  -- What staff already know, shown back to the student to confirm.
  student_name       text NOT NULL,
  photo_url          text,
  exam_type          text NOT NULL DEFAULT 'NATA' CHECK (exam_type IN ('NATA', 'JEE_PAPER_2', 'BOTH')),
  exam_year          integer,
  air_rank           integer CHECK (air_rank IS NULL OR air_rank > 0),
  percentile         numeric(6, 3) CHECK (percentile IS NULL OR (percentile >= 0 AND percentile <= 100)),
  score              integer,
  college_admitted   text,
  center_id          uuid REFERENCES public.offline_centers(id) ON DELETE SET NULL,
  city               text,
  learning_mode      text CHECK (learning_mode IS NULL OR learning_mode IN ('online', 'hybrid', 'offline')),
  phone              text,

  -- Facts the student said were wrong, e.g. {"college_admitted": "NIT Trichy"}.
  -- Kept apart so staff see the difference before anything is published.
  student_corrections jsonb NOT NULL DEFAULT '{}'::jsonb,

  testimonial_id     uuid REFERENCES public.testimonials(id) ON DELETE SET NULL,
  ai_call_count      integer NOT NULL DEFAULT 0,

  -- The one Google profile this student is asked to review, and what they did.
  google_target_url               text,
  google_clicked_at               timestamptz,
  google_posted_self_reported_at  timestamptz,
  -- One directory per student, rotated so JustDial and Sulekha fill evenly.
  secondary_platform    text CHECK (secondary_platform IS NULL OR secondary_platform IN ('justdial', 'sulekha')),
  secondary_clicked_at  timestamptz,
  reminder_sent_at      timestamptz,

  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  -- When staff copied the link: the most an app can claim about a WhatsApp message.
  sent_at        timestamptz,
  sent_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  opened_at      timestamptz,
  open_count     integer NOT NULL DEFAULT 0,
  submitted_at   timestamptz,  -- first submit; never moves again
  cancelled_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS review_requests_token_key ON public.review_requests (token);
CREATE INDEX IF NOT EXISTS review_requests_status_idx ON public.review_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS review_requests_testimonial_idx ON public.review_requests (testimonial_id) WHERE testimonial_id IS NOT NULL;

-- At most one live link per known student, so staff never wonder which one they
-- sent. Regenerating must cancel the old row BEFORE inserting.
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_one_live_per_user
  ON public.review_requests (user_id)
  WHERE user_id IS NOT NULL AND status IN ('active', 'opened', 'submitted');

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: service-role only, default deny. The student who opens the
-- link is not signed in, so the token is checked in the route, never by RLS.

COMMENT ON TABLE public.review_requests IS
  'A link asking one past student for a review, prefilled with what staff know. The row is the authority: cancelling it kills the link. The review itself lands in testimonials.';

-- ---------------------------------------------------------------------------
-- testimonials: the facts and the audit trail a verified review carries
-- ---------------------------------------------------------------------------
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS percentile numeric(6, 3),
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.offline_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_request_id uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_verified_student boolean NOT NULL DEFAULT false,
  -- Exactly what the student submitted. Staff edits write content.en, never this.
  ADD COLUMN IF NOT EXISTS original_text text,
  ADD COLUMN IF NOT EXISTS voice_transcript text,
  ADD COLUMN IF NOT EXISTS input_mode text,
  ADD COLUMN IF NOT EXISTS staff_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_input_mode_chk
    CHECK (input_mode IS NULL OR input_mode IN ('typed', 'voice'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_testimonials_review_request
  ON public.testimonials (review_request_id) WHERE review_request_id IS NOT NULL;

COMMENT ON COLUMN public.testimonials.original_text IS
  'The student''s own words as submitted. Staff edits change content.en; this stays put as the audit trail.';

NOTIFY pgrst, 'reload schema';
