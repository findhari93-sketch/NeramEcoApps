-- Enrolment links where the STUDENT pays (UPI or bank transfer to the trust),
-- instead of staff recording money already received.
--
-- Flow: staff make a 'student_pays' link -> the offer (full amount, or
-- installment 1 + 2) is snapshotted from fee_structures -> the student picks a
-- plan, pays, and submits the UTR + screenshot -> the link becomes
-- 'payment_submitted' -> staff verify against the bank statement -> the
-- enrolment is finalised (student profile, fees, link 'used').
-- A submission is a claim, not money: nothing is enrolled until staff verify.

-- 1. A new link status. Not used anywhere else in this migration, so it is safe
--    inside the migration's transaction (PG 12+).
ALTER TYPE public.direct_enrollment_link_status ADD VALUE IF NOT EXISTS 'payment_submitted';

-- The Admin bell: "Radhika says she paid Rs 25,000, verify it".
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'payment_to_verify';

-- 2. The offer and the student's claim.
ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS fee_structure_id uuid REFERENCES public.fee_structures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_full_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS offer_installment_1 numeric(10, 2),
  ADD COLUMN IF NOT EXISTS offer_installment_2 numeric(10, 2),
  ADD COLUMN IF NOT EXISTS offer_balance_due_days integer,
  ADD COLUMN IF NOT EXISTS chosen_scheme text,
  ADD COLUMN IF NOT EXISTS submitted_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS submitted_utr text,
  ADD COLUMN IF NOT EXISTS submitted_method text,
  ADD COLUMN IF NOT EXISTS submitted_paid_on date,
  ADD COLUMN IF NOT EXISTS submitted_proof_url text,
  ADD COLUMN IF NOT EXISTS submitted_form jsonb,
  ADD COLUMN IF NOT EXISTS submitted_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.direct_enrollment_links
    ADD CONSTRAINT direct_enrollment_links_payment_mode_check
    CHECK (payment_mode IN ('recorded', 'student_pays'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.direct_enrollment_links
    ADD CONSTRAINT direct_enrollment_links_chosen_scheme_check
    CHECK (chosen_scheme IS NULL OR chosen_scheme IN ('full', 'installment'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.direct_enrollment_links
    ADD CONSTRAINT direct_enrollment_links_submitted_method_check
    CHECK (submitted_method IS NULL OR submitted_method IN ('upi_direct', 'bank_transfer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. One UTR, one claim. Stored as 12 digits; a rejected claim clears it, which
--    frees the number for a corrected resubmission.
CREATE UNIQUE INDEX IF NOT EXISTS direct_enrollment_links_submitted_utr_key
  ON public.direct_enrollment_links(submitted_utr)
  WHERE submitted_utr IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_direct_payment_utr
  ON public.payments(direct_payment_utr)
  WHERE direct_payment_utr IS NOT NULL;

-- 4. New activity kinds for the link log.
ALTER TABLE public.direct_enrollment_link_events
  DROP CONSTRAINT IF EXISTS direct_enrollment_link_events_kind_check;
ALTER TABLE public.direct_enrollment_link_events
  ADD CONSTRAINT direct_enrollment_link_events_kind_check CHECK (kind IN (
    'created', 'updated', 'copied', 'emailed', 'email_failed',
    'whatsapp_opened', 'whatsapp_sent', 'whatsapp_failed',
    'cancelled', 'merged',
    'payment_submitted', 'payment_verified', 'payment_rejected'
  ));

-- 5. Where students pay. Editable in Admin > Settings > Payment details.
INSERT INTO public.site_settings (key, value, updated_at)
VALUES (
  'payment_payee',
  jsonb_build_object(
    'upiId', 'neramclassroom-1@okhdfcbank',
    'payeeName', 'Manoharan Trust',
    'gpayNumber', '8807437399',
    'bank', jsonb_build_object(
      'accountName', 'Manoharan Trust',
      'accountNumber', '1928135000001183',
      'ifsc', 'KVBL0001928',
      'bankName', 'Karur Vysya Bank',
      'branch', 'Pudukkottai'
    ),
    'accessUntilLabel', 'September 2027'
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
