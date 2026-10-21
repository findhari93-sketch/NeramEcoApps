-- Enrolment wizard drafts: what the student has typed so far on a link, so
-- they continue from any device. Separate from submitted_form, which is the
-- complete application that enrolment and auto-fulfilment read.
ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS draft_form jsonb,
  ADD COLUMN IF NOT EXISTS draft_step smallint,
  ADD COLUMN IF NOT EXISTS draft_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.direct_enrollment_links.draft_form IS 'Wizard form state as typed so far (personal, location, academic, payment). Only the signed-in student who wrote it reads it back; never used to enrol.';
COMMENT ON COLUMN public.direct_enrollment_links.draft_step IS 'The wizard step (0..3) the student was on when the draft was saved.';
COMMENT ON COLUMN public.direct_enrollment_links.draft_saved_at IS 'When the draft was last saved; the client keeps the newer of this and its local copy.';
COMMENT ON COLUMN public.direct_enrollment_links.draft_user_id IS 'The account that wrote the draft.';
