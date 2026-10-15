-- College update links: a no-login form staff send to a college on WhatsApp.
--
-- Staff make a link in Admin > College Hub > Update links. The college person
-- opens /college-update/<token>, fills in the sections asked for, and each
-- changed section lands in college_content_submissions (source 'link') for
-- staff review, exactly like an edit from the college dashboard.
--
-- Only the sha256 of the token is stored: the raw token exists only in the
-- link that was sent. Service role only (RLS on, no policies).

CREATE TABLE IF NOT EXISTS public.college_update_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id       UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  sections         TEXT[] NOT NULL DEFAULT ARRAY['profile', 'fees', 'admissions', 'location', 'photos'],
  recipient_name   TEXT,
  recipient_phone  TEXT,
  note             TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  revoked_at       TIMESTAMPTZ,
  revoked_by       TEXT,
  first_opened_at  TIMESTAMPTZ,
  last_opened_at   TIMESTAMPTZ,
  open_count       INTEGER NOT NULL DEFAULT 0,
  submitted_at     TIMESTAMPTZ,
  submit_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS college_update_links_college_idx ON public.college_update_links(college_id, created_at DESC);
ALTER TABLE public.college_update_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.college_content_submissions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'dashboard';
ALTER TABLE public.college_content_submissions DROP CONSTRAINT IF EXISTS college_content_submissions_source_check;
ALTER TABLE public.college_content_submissions
  ADD CONSTRAINT college_content_submissions_source_check CHECK (source IN ('dashboard', 'link'));
ALTER TABLE public.college_content_submissions
  ADD COLUMN IF NOT EXISTS update_link_id UUID REFERENCES public.college_update_links(id) ON DELETE SET NULL;
ALTER TABLE public.college_content_submissions ADD COLUMN IF NOT EXISTS submitter_role TEXT;
ALTER TABLE public.college_content_submissions ADD COLUMN IF NOT EXISTS submitter_phone TEXT;

NOTIFY pgrst, 'reload schema';
