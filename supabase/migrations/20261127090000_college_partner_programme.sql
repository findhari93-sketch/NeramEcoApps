-- College partner programme (Papni pilot).
--
-- 1. college_plans: staff give a college a plan (tier + dates + amount), extend,
--    change or revoke it, with history. A trigger copies the active plan onto
--    colleges.neram_tier / tier_* so every existing reader keeps working, and a
--    daily job ends plans past their end date (the tier then drops to free).
-- 2. college_admins roles: owner / editor / viewer (was admin / viewer).
-- 3. college_content_submissions: what a college edits in its dashboard waits
--    here until staff approve it.
-- 4. colleges: college-provided stamps, admission dates, suggested map pins.
-- 5. college_reviews: one public reply from the college per review.
-- 6. college_leads: parent phone, wider status list, college note, auto-delivery.
-- 7. college_account_requests: "Request an account" from the dashboard login.
--
-- All new tables have RLS on and no policies: only the service role (the
-- marketing and admin API routes) reads or writes them.

-- ─── 1. Plans ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.college_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id    UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL CHECK (tier IN ('silver', 'gold', 'platinum')),
  starts_on     DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  ends_on       DATE NOT NULL,
  amount        NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'ended')),
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,
  revoked_by    TEXT,
  revoke_reason TEXT,
  CHECK (ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS college_plans_one_active
  ON public.college_plans(college_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS college_plans_college_idx ON public.college_plans(college_id, created_at DESC);

ALTER TABLE public.college_plans ENABLE ROW LEVEL SECURITY;

-- Copy the college's active plan (if it has started) onto the colleges row.
CREATE OR REPLACE FUNCTION public.sync_college_tier(p_college_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.college_plans;
  today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT * INTO p FROM public.college_plans
  WHERE college_id = p_college_id AND status = 'active'
  LIMIT 1;

  IF FOUND AND p.starts_on <= today AND p.ends_on >= today THEN
    UPDATE public.colleges
    SET neram_tier = p.tier, tier_start_date = p.starts_on, tier_end_date = p.ends_on, tier_amount = p.amount
    WHERE id = p_college_id;
  ELSE
    UPDATE public.colleges
    SET neram_tier = 'free', tier_start_date = NULL, tier_end_date = NULL, tier_amount = NULL
    WHERE id = p_college_id AND (neram_tier IS DISTINCT FROM 'free' OR tier_end_date IS NOT NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.college_plans_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_college_tier(COALESCE(NEW.college_id, OLD.college_id));
  IF TG_OP = 'UPDATE' AND OLD.college_id IS DISTINCT FROM NEW.college_id THEN
    PERFORM public.sync_college_tier(OLD.college_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS college_plans_sync ON public.college_plans;
CREATE TRIGGER college_plans_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.college_plans
  FOR EACH ROW EXECUTE FUNCTION public.college_plans_after_change();

-- Daily: end plans past their end date, and switch on plans that start today.
CREATE OR REPLACE FUNCTION public.refresh_college_plans()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  ended INTEGER;
  r RECORD;
BEGIN
  UPDATE public.college_plans
  SET status = 'ended', updated_at = now()
  WHERE status = 'active' AND ends_on < today;
  GET DIAGNOSTICS ended = ROW_COUNT;

  FOR r IN SELECT college_id FROM public.college_plans WHERE status = 'active' AND starts_on = today LOOP
    PERFORM public.sync_college_tier(r.college_id);
  END LOOP;

  RETURN ended;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_college_tier(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_college_plans() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.college_plans_after_change() FROM PUBLIC, anon, authenticated;

-- Backfill: one active plan per college already on a paid tier, from the
-- existing columns. Plans that would already be over are recorded as ended.
INSERT INTO public.college_plans (college_id, tier, starts_on, ends_on, amount, status, notes, created_by)
SELECT
  c.id,
  c.neram_tier,
  COALESCE(c.tier_start_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
  GREATEST(
    COALESCE(c.tier_end_date, COALESCE(c.tier_start_date, (now() AT TIME ZONE 'Asia/Kolkata')::date) + 365),
    COALESCE(c.tier_start_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ),
  COALESCE(c.tier_amount, 0),
  CASE
    WHEN COALESCE(c.tier_end_date, COALESCE(c.tier_start_date, (now() AT TIME ZONE 'Asia/Kolkata')::date) + 365)
         < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'ended'
    ELSE 'active'
  END,
  'Carried over from the tier set before plans existed',
  'migration'
FROM public.colleges c
WHERE c.neram_tier IN ('silver', 'gold', 'platinum')
  AND NOT EXISTS (SELECT 1 FROM public.college_plans p WHERE p.college_id = c.id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'college-plans-daily';
    -- 00:05 IST
    PERFORM cron.schedule('college-plans-daily', '35 18 * * *', 'SELECT public.refresh_college_plans()');
  END IF;
END $$;

-- ─── 2. College account roles ────────────────────────────────────────────────

ALTER TABLE public.college_admins DROP CONSTRAINT IF EXISTS college_admins_role_check;
UPDATE public.college_admins SET role = 'owner' WHERE role = 'admin';
ALTER TABLE public.college_admins ALTER COLUMN role SET DEFAULT 'editor';
ALTER TABLE public.college_admins
  ADD CONSTRAINT college_admins_role_check CHECK (role IN ('owner', 'editor', 'viewer'));
ALTER TABLE public.college_admins ADD COLUMN IF NOT EXISTS invited_by TEXT;
ALTER TABLE public.college_admins ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS college_admins_email_lower_idx ON public.college_admins (lower(email));

-- ─── 3. Content submitted by colleges ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.college_content_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id        UUID NOT NULL REFERENCES public.colleges(id) ON DELETE CASCADE,
  section           TEXT NOT NULL CHECK (section IN ('profile', 'fees', 'admissions', 'facilities', 'location', 'photos')),
  payload           JSONB NOT NULL,
  previous          JSONB,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_by      UUID REFERENCES public.college_admins(id) ON DELETE SET NULL,
  submitted_by_name TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,
  review_note       TEXT
);

-- One open submission per section: a new edit replaces the pending one.
CREATE UNIQUE INDEX IF NOT EXISTS college_content_submissions_one_pending
  ON public.college_content_submissions(college_id, section) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS college_content_submissions_queue
  ON public.college_content_submissions(status, submitted_at DESC);

ALTER TABLE public.college_content_submissions ENABLE ROW LEVEL SECURITY;

-- ─── 4. Colleges: stamps, admission dates, suggested map pins ───────────────

-- { "fees": "2026-10-14T..", "location": ".." }: when staff last approved
-- college-provided content per section. The public page shows
-- "Provided by the college, updated <date>".
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS college_provided JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS admission_opens_on DATE;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS admission_closes_on DATE;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS scholarships_text TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS geo_suggested_lat NUMERIC;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS geo_suggested_lng NUMERIC;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS geo_suggested_source TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS geo_suggested_label TEXT;
ALTER TABLE public.colleges ADD COLUMN IF NOT EXISTS geo_suggested_at TIMESTAMPTZ;

-- ─── 5. Review replies ───────────────────────────────────────────────────────

ALTER TABLE public.college_reviews ADD COLUMN IF NOT EXISTS college_reply TEXT;
ALTER TABLE public.college_reviews ADD COLUMN IF NOT EXISTS college_reply_at TIMESTAMPTZ;
ALTER TABLE public.college_reviews ADD COLUMN IF NOT EXISTS college_reply_by TEXT;

-- ─── 6. Leads ────────────────────────────────────────────────────────────────

ALTER TABLE public.college_leads ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.college_leads ADD COLUMN IF NOT EXISTS college_note TEXT;
ALTER TABLE public.college_leads ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE public.college_leads ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.college_leads DROP CONSTRAINT IF EXISTS college_leads_status_check;
ALTER TABLE public.college_leads
  ADD CONSTRAINT college_leads_status_check
  CHECK (status IN ('new', 'contacted', 'visited', 'admitted', 'not_interested', 'qualified', 'converted', 'dropped'));

-- ─── 7. Account requests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.college_account_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name  TEXT NOT NULL,
  college_id    UUID REFERENCES public.colleges(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  designation   TEXT,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'declined')),
  handled_by    TEXT,
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS college_account_requests_status ON public.college_account_requests(status, created_at DESC);
ALTER TABLE public.college_account_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
