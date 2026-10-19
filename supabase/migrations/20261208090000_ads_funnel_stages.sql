-- Google Ads funnel stages: each of the four ad-funnel stages is recorded once
-- per user in user_funnel_events, so a browser conversion fires only the first
-- time and offline conversions can be exported from one place.
--
--   signup_verified        first phone verification of an account   (auth)
--   application_submitted  application form submitted              (application)
--   demo_attended          demo class marked attended              (marketing)
--   enrolled               first paid payment                      (enrollment)
--
-- Value (INR) lives in metadata.value_inr; the table has no value column.
-- Spec: apps/marketing/Docs/GOOGLE_ADS_TRACKING_IMPLEMENTATION.md

-- 1. Last touch next to first touch (first_touch stays write-once).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_touch jsonb;

-- 2. One row per user per stage.
CREATE UNIQUE INDEX IF NOT EXISTS user_funnel_events_stage_once_idx
  ON public.user_funnel_events (user_id, event)
  WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled');

-- 3. Claim a stage. True only for the call that wrote the row.
CREATE OR REPLACE FUNCTION public.claim_funnel_stage(
  p_user_id uuid,
  p_stage text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_app text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_funnel text;
  v_id uuid;
BEGIN
  v_funnel := CASE p_stage
    WHEN 'signup_verified' THEN 'auth'
    WHEN 'application_submitted' THEN 'application'
    WHEN 'demo_attended' THEN 'marketing'
    WHEN 'enrolled' THEN 'enrollment'
  END;
  IF v_funnel IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_funnel_events (user_id, funnel, event, status, metadata, source_app, created_at)
  VALUES (p_user_id, v_funnel, p_stage, 'completed', COALESCE(p_metadata, '{}'::jsonb), COALESCE(p_source_app, 'app'), COALESCE(p_occurred_at, now()))
  ON CONFLICT (user_id, event)
    WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled')
    DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_funnel_stage(uuid, text, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_funnel_stage(uuid, text, jsonb, text, timestamptz) TO service_role;

-- 4. Enrolled: the first paid payment, whichever of the payment paths wrote it
--    (Razorpay verify in marketing and app, direct enrolment, office fees,
--    screenshot approval).
CREATE OR REPLACE FUNCTION public.tg_funnel_stage_enrolled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.claim_funnel_stage(
    NEW.user_id,
    'enrolled',
    jsonb_build_object(
      'payment_id', NEW.id,
      'lead_profile_id', NEW.lead_profile_id,
      'payment_method', NEW.payment_method,
      'value_inr', NEW.amount
    ),
    NULL,
    COALESCE(NEW.paid_at, now())
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_funnel_stage_enrolled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS funnel_stage_enrolled ON public.payments;
CREATE TRIGGER funnel_stage_enrolled
  AFTER INSERT OR UPDATE OF status, user_id ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_funnel_stage_enrolled();

-- 5. Demo attended: Admin "Mark attended" and "Record held demo" both set it.
CREATE OR REPLACE FUNCTION public.tg_funnel_stage_demo_attended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.claim_funnel_stage(
    NEW.user_id,
    'demo_attended',
    jsonb_build_object('demo_registration_id', NEW.id, 'value_inr', 0),
    NULL,
    COALESCE(NEW.attendance_marked_at, now())
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_funnel_stage_demo_attended() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS funnel_stage_demo_attended ON public.demo_class_registrations;
CREATE TRIGGER funnel_stage_demo_attended
  AFTER INSERT OR UPDATE OF attended, status, user_id ON public.demo_class_registrations
  FOR EACH ROW
  WHEN ((NEW.attended IS TRUE OR NEW.status = 'attended') AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_funnel_stage_demo_attended();

-- 6. Backfill. Without it every existing student's next phone login would be
--    claimed as a brand-new sign-up and fire a conversion.
INSERT INTO public.user_funnel_events (user_id, funnel, event, status, source_app, metadata, created_at)
SELECT u.id, 'auth', 'signup_verified', 'completed', 'app',
       jsonb_build_object('backfilled', true, 'value_inr', 100),
       COALESCE(
         (SELECT min(e.created_at) FROM public.user_funnel_events e WHERE e.user_id = u.id AND e.event = 'otp_verified'),
         u.created_at,
         now()
       )
FROM public.users u
WHERE u.phone_verified IS TRUE
ON CONFLICT (user_id, event)
  WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled')
  DO NOTHING;

INSERT INTO public.user_funnel_events (user_id, funnel, event, status, source_app, metadata, created_at)
SELECT DISTINCT ON (lp.user_id)
       lp.user_id, 'application', 'application_submitted', 'completed', 'app',
       jsonb_build_object('backfilled', true, 'application_id', lp.id, 'value_inr', 500),
       COALESCE(lp.form_completed_at, lp.created_at, now())
FROM public.lead_profiles lp
WHERE lp.user_id IS NOT NULL
  AND lp.deleted_at IS NULL
  AND lp.status::text NOT IN ('draft', 'pending_verification', 'deleted')
ORDER BY lp.user_id, COALESCE(lp.form_completed_at, lp.created_at)
ON CONFLICT (user_id, event)
  WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled')
  DO NOTHING;

INSERT INTO public.user_funnel_events (user_id, funnel, event, status, source_app, metadata, created_at)
SELECT DISTINCT ON (p.user_id)
       p.user_id, 'enrollment', 'enrolled', 'completed', 'app',
       jsonb_build_object('backfilled', true, 'payment_id', p.id, 'lead_profile_id', p.lead_profile_id,
                          'payment_method', p.payment_method, 'value_inr', p.amount),
       COALESCE(p.paid_at, p.created_at, now())
FROM public.payments p
WHERE p.user_id IS NOT NULL AND p.status = 'paid'
ORDER BY p.user_id, COALESCE(p.paid_at, p.created_at)
ON CONFLICT (user_id, event)
  WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled')
  DO NOTHING;

INSERT INTO public.user_funnel_events (user_id, funnel, event, status, source_app, metadata, created_at)
SELECT DISTINCT ON (d.user_id)
       d.user_id, 'marketing', 'demo_attended', 'completed', 'app',
       jsonb_build_object('backfilled', true, 'demo_registration_id', d.id, 'value_inr', 0),
       COALESCE(d.attendance_marked_at, d.created_at, now())
FROM public.demo_class_registrations d
WHERE d.user_id IS NOT NULL AND (d.attended IS TRUE OR d.status = 'attended')
ORDER BY d.user_id, COALESCE(d.attendance_marked_at, d.created_at)
ON CONFLICT (user_id, event)
  WHERE event IN ('signup_verified', 'application_submitted', 'demo_attended', 'enrolled')
  DO NOTHING;

-- 7. Offline conversion export (Google Ads Data Manager PostgreSQL connector or
--    a Sheets sync). Phones are hashed as E.164; 10-digit numbers get +91.
CREATE OR REPLACE VIEW public.gads_offline_conversions
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    fe.user_id,
    fe.event,
    fe.created_at,
    COALESCE(NULLIF(fe.metadata->>'value_inr', '')::numeric, 0) AS value_inr,
    u.first_touch,
    CASE
      WHEN regexp_replace(COALESCE(u.phone, ''), '[^0-9+]', '', 'g') ~ '^\+[0-9]{8,15}$'
        THEN regexp_replace(u.phone, '[^0-9+]', '', 'g')
      WHEN regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
        THEN '+91' || regexp_replace(u.phone, '[^0-9]', '', 'g')
      ELSE NULL
    END AS phone_e164
  FROM public.user_funnel_events fe
  JOIN public.users u ON u.id = fe.user_id
  WHERE fe.event IN ('demo_attended', 'enrolled')
    AND fe.created_at > now() - interval '90 days'
)
SELECT
  first_touch->>'gclid' AS google_click_id,
  first_touch->>'gbraid' AS gbraid,
  first_touch->>'wbraid' AS wbraid,
  CASE event WHEN 'demo_attended' THEN 'Demo Attended' WHEN 'enrolled' THEN 'Enrolled (Fee Paid)' END AS conversion_name,
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') || '+0530' AS conversion_time,
  value_inr AS conversion_value,
  'INR'::text AS conversion_currency,
  CASE WHEN phone_e164 IS NOT NULL THEN encode(extensions.digest(phone_e164, 'sha256'), 'hex') END AS hashed_phone_number,
  event || '_' || user_id AS order_id
FROM base
WHERE first_touch->>'gclid' IS NOT NULL
   OR first_touch->>'gbraid' IS NOT NULL
   OR first_touch->>'wbraid' IS NOT NULL
   OR phone_e164 IS NOT NULL;

REVOKE ALL ON public.gads_offline_conversions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.gads_offline_conversions TO service_role;

-- 8. The Admin offline uploader gets a demo_attended conversion kind.
ALTER TABLE public.ads_conversion_uploads DROP CONSTRAINT IF EXISTS ads_conversion_uploads_conversion_type_check;
ALTER TABLE public.ads_conversion_uploads ADD CONSTRAINT ads_conversion_uploads_conversion_type_check
  CHECK (conversion_type IN ('phone_verified', 'demo_booked', 'demo_attended', 'admission_paid'));
