-- ============================================================================
-- Feedback and outcomes: consent before anything a learner says goes public.
--
-- testimonials were admin-entered, not linked to a person, with no consent
-- record. Learners (many of them minors) can now submit their own; nothing is
-- public until a person consented AND staff approved it.
--
--   testimonials.user_id              who it is about (nullable: older rows)
--   testimonials.source               'staff' (entered by staff) | 'learner'
--   testimonials.publication_status   private | pending_moderation | approved
--                                     | published | rejected | withdrawn
--   testimonials.consent_*            when, by whom (self | guardian |
--                                     staff_recorded) and the display name
--                                     the person agreed to
--   testimonials.moderated_*          who approved or rejected it, and why
--
-- is_active stays the public flag every reader already uses (marketing reads
-- is_active). A trigger keeps the two in step, and a learner testimonial can
-- only be published with a consent on record.
--
-- Also: student_results.user_id, app_feedback.topics, learner_outcomes_view,
-- public_review_stats() for a rating computed from data.
-- ============================================================================

ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS publication_status text,
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_by text,
  ADD COLUMN IF NOT EXISTS consent_display_name text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_note text;

UPDATE public.testimonials
   SET publication_status = CASE WHEN is_active THEN 'published' ELSE 'private' END,
       consent_by = COALESCE(consent_by, 'staff_recorded')
 WHERE publication_status IS NULL;

ALTER TABLE public.testimonials ALTER COLUMN publication_status SET DEFAULT 'private';
ALTER TABLE public.testimonials ALTER COLUMN publication_status SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_source_chk CHECK (source IN ('staff', 'learner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_publication_status_chk CHECK (
    publication_status IN ('private', 'pending_moderation', 'approved', 'published', 'rejected', 'withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_consent_by_chk CHECK (
    consent_by IS NULL OR consent_by IN ('self', 'guardian', 'staff_recorded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A learner's own words are public only with their (or a guardian's) consent.
DO $$ BEGIN
  ALTER TABLE public.testimonials ADD CONSTRAINT testimonials_learner_publish_needs_consent CHECK (
    NOT (source = 'learner' AND publication_status = 'published' AND consent_given_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.testimonials_sync_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'learner' THEN
      -- Learner submissions always start hidden, whatever the client sent.
      NEW.publication_status := 'pending_moderation';
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.is_active := false;
    ELSIF NEW.publication_status IS NULL OR NEW.publication_status = 'private' THEN
      NEW.publication_status := CASE WHEN NEW.is_active THEN 'published' ELSE 'private' END;
    ELSE
      NEW.is_active := (NEW.publication_status = 'published');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.publication_status IS DISTINCT FROM OLD.publication_status THEN
    NEW.is_active := (NEW.publication_status = 'published');
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    -- The older admin editor toggles is_active directly.
    NEW.publication_status := CASE WHEN NEW.is_active THEN 'published' ELSE 'withdrawn' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_testimonials_sync_publication ON public.testimonials;
CREATE TRIGGER trg_testimonials_sync_publication
  BEFORE INSERT OR UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.testimonials_sync_publication();

CREATE INDEX IF NOT EXISTS idx_testimonials_pending
  ON public.testimonials (submitted_at DESC) WHERE publication_status = 'pending_moderation';
CREATE INDEX IF NOT EXISTS idx_testimonials_user ON public.testimonials (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.student_results
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_student_results_user ON public.student_results (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.app_feedback ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}';

-- Outcomes, kept apart from opinions: staff-verified results and alumni records.
CREATE OR REPLACE VIEW public.learner_outcomes_view
WITH (security_invoker = true) AS
SELECT
  'result:' || r.id::text AS id,
  r.user_id,
  r.student_name AS display_name,
  upper(r.exam_type) AS exam,
  r.exam_year,
  CASE WHEN r.college_name IS NOT NULL THEN 'college_admission' ELSE 'exam_completed' END AS outcome_type,
  r.college_name AS college,
  r.score,
  r.max_score,
  r.rank,
  'verified' AS verification_status,
  r.is_published AS is_public,
  r.created_at
FROM public.student_results r
UNION ALL
SELECT
  'alumni:' || a.id::text,
  a.user_id,
  u.name,
  a.exam_name,
  a.expected_graduation_year - 5,
  CASE WHEN a.college_name IS NOT NULL OR a.college_id IS NOT NULL THEN 'college_admission' ELSE 'course_completed' END,
  a.college_name,
  NULL, NULL, NULL,
  CASE WHEN a.is_verified THEN 'verified' ELSE 'self_reported' END,
  false,
  a.created_at
FROM public.alumni_profiles a
JOIN public.users u ON u.id = a.user_id;

COMMENT ON VIEW public.learner_outcomes_view IS
  'Exam results and college admissions, separate from reviews. verification_status says who vouches for it.';

REVOKE ALL ON public.learner_outcomes_view FROM anon, authenticated;
GRANT SELECT ON public.learner_outcomes_view TO service_role;

-- The public rating, computed from published testimonials that a person has
-- confirmed in the moderation queue (moderated_at set). The nine testimonials
-- that predate this workflow were all entered on one day and nobody has vouched
-- for them yet, so they stay on the legacy /testimonials page but do not feed
-- the new review pages, Review markup or the rating until staff confirm them.
CREATE OR REPLACE FUNCTION public.public_review_stats()
RETURNS TABLE (scope text, review_count integer, rating_count integer, average_rating numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'all', count(*)::int, count(rating)::int, round(avg(rating)::numeric, 2)
    FROM testimonials WHERE publication_status = 'published' AND moderated_at IS NOT NULL
  UNION ALL
  SELECT lower(exam_type::text), count(*)::int, count(rating)::int, round(avg(rating)::numeric, 2)
    FROM testimonials WHERE publication_status = 'published' AND moderated_at IS NOT NULL AND exam_type IS NOT NULL
   GROUP BY lower(exam_type::text);
$$;

REVOKE ALL ON FUNCTION public.public_review_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_review_stats() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
