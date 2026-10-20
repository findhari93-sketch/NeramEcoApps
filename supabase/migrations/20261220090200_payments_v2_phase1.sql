-- Payments v2, Phase 1: proof is a screenshot OR "sent on WhatsApp", the UTR is
-- optional, links live longer, and staff can price a link per student.
-- The legacy columns stay the read model through this phase (ledger ruling);
-- the bridge keeps payment_attempts in step.

-- 1. Enrolment links: how the proof came, who paid, and the per-student price.
ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS submitted_proof_channel text,
  ADD COLUMN IF NOT EXISTS submitted_payer_name text,
  ADD COLUMN IF NOT EXISTS last_extended_at timestamptz,
  ADD COLUMN IF NOT EXISTS extended_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.direct_enrollment_links
    ADD CONSTRAINT direct_enrollment_links_submitted_proof_channel_check
    CHECK (submitted_proof_channel IS NULL OR submitted_proof_channel IN ('upload', 'whatsapp'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing submissions all came with a screenshot.
UPDATE public.direct_enrollment_links
   SET submitted_proof_channel = 'upload'
 WHERE submitted_proof_channel IS NULL AND submitted_proof_url IS NOT NULL;

-- 2. Balance claims: a screenshot or WhatsApp, UTR optional.
ALTER TABLE public.fee_payment_claims
  ALTER COLUMN utr DROP NOT NULL,
  ALTER COLUMN proof_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS proof_channel text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS payer_name text;

DO $$ BEGIN
  ALTER TABLE public.fee_payment_claims
    ADD CONSTRAINT fee_payment_claims_proof_channel_check CHECK (proof_channel IN ('upload', 'whatsapp'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.fee_payment_claims
    ADD CONSTRAINT fee_payment_claims_proof_present_check
    CHECK (proof_url IS NOT NULL OR proof_channel = 'whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. New activity kinds for the link log.
ALTER TABLE public.direct_enrollment_link_events
  DROP CONSTRAINT IF EXISTS direct_enrollment_link_events_kind_check;
ALTER TABLE public.direct_enrollment_link_events
  ADD CONSTRAINT direct_enrollment_link_events_kind_check CHECK (kind IN (
    'created', 'updated', 'copied', 'emailed', 'email_failed',
    'whatsapp_opened', 'whatsapp_sent', 'whatsapp_failed',
    'cancelled', 'merged',
    'payment_submitted', 'payment_verified', 'payment_rejected',
    'details_saved', 'reminder_sent', 'expired', 'extended'
  ));

-- 4. Settings: official QR codes live as [{ amountPaise, url, label }]; the
--    payee carries the WhatsApp number for proofs (seeded null in 20261220090000).
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('payment_qr_codes', '[]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
