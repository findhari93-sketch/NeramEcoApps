-- ============================================================================
-- OFFLINE CONVERSIONS: TELL GOOGLE ADS WHO SIGNED UP
--
-- Neram's conversion is a person who signs in to the app and completes phone
-- OTP verification. From then on the team has the number and converts by
-- phone and demo classes; nobody has paid through the application form. The
-- page tags never reported that moment: the app's "signup" tag fires on
-- account creation (before OTP, and often not at all).
--
-- apps/admin/src/lib/marketing-ai/ads/conversions.ts uploads, keyed on users:
--   phone_verified  users.phone_verified (the primary conversion Google bids for)
--   demo_booked     demo_class_registrations.user_id   (secondary, reporting)
--   admission_paid  payments.status = 'paid', value = amount (secondary)
--
-- Matching: the ad click id kept in users.first_touch (gclid, wbraid or gbraid)
-- when there is one, plus the SHA-256 of the phone (E.164) and email, which is
-- Google's "enhanced conversions for leads". So a sign-up with no stored click
-- id can still be credited to the ad. Nothing unhashed leaves the database.
--
-- One row per (user, conversion type) is the dedupe: nobody is uploaded twice
-- for the same conversion, however often the job runs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ads_conversion_uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  conversion_type   text NOT NULL CHECK (conversion_type IN ('phone_verified', 'demo_booked', 'admission_paid')),
  click_id_type     text NOT NULL CHECK (click_id_type IN ('gclid', 'gbraid', 'wbraid', 'none')),
  click_id          text,
  -- Which identifiers were sent: any of 'click_id', 'phone', 'email'.
  matched_by        text[] NOT NULL DEFAULT '{}',
  conversion_time   timestamptz NOT NULL,
  value_inr         numeric,
  order_id          text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'uploaded', 'failed', 'skipped')),
  google_response   jsonb,
  error             text,
  run_id            uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  uploaded_at       timestamptz,
  UNIQUE (user_id, conversion_type)
);

CREATE INDEX IF NOT EXISTS idx_ads_conversion_uploads_status ON public.ads_conversion_uploads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_conversion_uploads_type_time ON public.ads_conversion_uploads (conversion_type, conversion_time DESC);

ALTER TABLE public.ads_conversion_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_conversion_uploads FROM anon, authenticated;
GRANT ALL ON public.ads_conversion_uploads TO service_role;

NOTIFY pgrst, 'reload schema';
