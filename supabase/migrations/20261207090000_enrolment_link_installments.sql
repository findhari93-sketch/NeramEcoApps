-- Enrolment links: payment plan (paid now + balance + due date), share
-- tracking, an activity log, and one active link per student.

ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS payment_scheme text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS installment_2_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS installment_2_due_date date,
  ADD COLUMN IF NOT EXISTS last_shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.direct_enrollment_links
    ADD CONSTRAINT direct_enrollment_links_payment_scheme_check
    CHECK (payment_scheme IN ('full', 'installment'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_user_id
  ON public.direct_enrollment_links(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_direct_enrollment_links_demo
  ON public.direct_enrollment_links(demo_registration_id) WHERE demo_registration_id IS NOT NULL;

-- What happened to a link: made, edited, shared, cancelled.
CREATE TABLE IF NOT EXISTS public.direct_enrollment_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.direct_enrollment_links(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'created', 'updated', 'copied', 'emailed', 'email_failed',
    'whatsapp_opened', 'whatsapp_sent', 'whatsapp_failed',
    'cancelled', 'merged'
  )),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_enrollment_link_events_link
  ON public.direct_enrollment_link_events(link_id, created_at DESC);

-- Server routes use the service role; nobody reads this with the anon key.
ALTER TABLE public.direct_enrollment_link_events ENABLE ROW LEVEL SECURITY;

-- One active link per student. Skipped (with a notice) while duplicates
-- remain; merge them, then run this statement again.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.direct_enrollment_links
    WHERE status = 'active' AND user_id IS NOT NULL
    GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'one_active_link_per_user skipped: duplicate active links exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_link_per_user
      ON public.direct_enrollment_links(user_id)
      WHERE status = 'active' AND user_id IS NOT NULL;
  END IF;
END $$;
