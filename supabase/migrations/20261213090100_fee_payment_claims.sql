-- Pay balance: an enrolled student pays the next installment (or the plain
-- balance) to the trust by UPI or bank transfer and submits the UTR and a
-- screenshot. That is a CLAIM: staff verify it against the bank in Admin >
-- Collections, and only then is a payments row written (recordOfficePayment).
-- The amount is the server's (the fee plan's next due), never the browser's.

CREATE TABLE IF NOT EXISTS public.fee_payment_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_profile_id uuid REFERENCES public.lead_profiles(id) ON DELETE SET NULL,
  installment_id uuid,
  installment_number integer,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('upi_direct', 'bank_transfer')),
  -- 12 digits for UPI/IMPS, 12 to 22 letters and digits for NEFT/RTGS.
  utr text NOT NULL,
  paid_on date NOT NULL,
  proof_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason text,
  rejected_at timestamptz,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A UTR backs one claim. A rejected claim frees it for a corrected resubmission.
CREATE UNIQUE INDEX IF NOT EXISTS fee_payment_claims_utr_key
  ON public.fee_payment_claims(utr)
  WHERE status IN ('pending', 'verified');

-- One claim waiting per student at a time.
CREATE UNIQUE INDEX IF NOT EXISTS fee_payment_claims_one_pending
  ON public.fee_payment_claims(user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fee_payment_claims_status
  ON public.fee_payment_claims(status, created_at DESC);

-- Server routes use the service role; nobody reads this with the anon key.
ALTER TABLE public.fee_payment_claims ENABLE ROW LEVEL SECURITY;
