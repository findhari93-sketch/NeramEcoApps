-- Payments v2: one model for every fee payment.
--
--   payment_intents    what a person owes for one purpose (an enrolment link, an installment)
--   payment_attempts   each try to pay it, by any method (instant UPI, UPI/bank + proof, Razorpay)
--   bank_credit_events what the bank (or Razorpay) says arrived, deduped by UTR and source
--   payment_outbox     jobs written in the same transaction as a state change, run with retries
--   payment_events     append-only audit of every transition
--   webhook_inbox      every inbound Razorpay / observer call, before it is trusted
--   watcher_heartbeats the office phone and the Gmail script saying "still alive"
--
-- `payments` stays the ledger of record: a succeeded attempt produces exactly one
-- payments row through the existing writers (finaliseDirectEnrolment, recordOfficePayment).
-- Amounts here are integer paise. Every state change goes through payments_transition(),
-- which checks the expected state, writes the audit row and the outbox jobs atomically,
-- and marks the intent paid exactly once (a second success is flagged, never fulfilled twice).

-- ─── 1. payment_intents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('enrolment', 'installment')),
  enrollment_link_id uuid REFERENCES public.direct_enrollment_links(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.payment_installments(id) ON DELETE SET NULL,
  lead_profile_id uuid REFERENCES public.lead_profiles(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scheme text CHECK (scheme IS NULL OR scheme IN ('full', 'installment')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired', 'cancelled')),
  paid_attempt_id uuid,
  paid_at timestamptz,
  expires_at timestamptz,
  allowed_methods text[] NOT NULL DEFAULT '{}',
  legacy_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_enrolment_needs_link CHECK (purpose <> 'enrolment' OR enrollment_link_id IS NOT NULL),
  CONSTRAINT payment_intents_has_owner CHECK (user_id IS NOT NULL OR enrollment_link_id IS NOT NULL)
);

-- One open intent per link, and per installment.
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_one_open_per_link
  ON public.payment_intents(enrollment_link_id) WHERE status = 'open' AND enrollment_link_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_one_open_per_installment
  ON public.payment_intents(installment_id) WHERE status = 'open' AND installment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_legacy_ref_key
  ON public.payment_intents(legacy_ref) WHERE legacy_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON public.payment_intents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_open_expiry ON public.payment_intents(expires_at) WHERE status = 'open';

-- ─── 2. payment_attempts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('upi_auto', 'upi_proof', 'bank_proof', 'razorpay')),
  state text NOT NULL DEFAULT 'created' CHECK (state IN (
    'created', 'awaiting_credit', 'awaiting_review',
    'succeeded', 'rejected', 'failed', 'expired', 'cancelled', 'disputed', 'reversed'
  )),
  -- What the student is asked to pay in THIS attempt: base + paise tag, or base + convenience fee.
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  paise_tag smallint CHECK (paise_tag IS NULL OR (paise_tag BETWEEN 1 AND 99)),
  convenience_fee_paise bigint NOT NULL DEFAULT 0 CHECK (convenience_fee_paise >= 0),
  provider text,
  provider_order_id text,
  provider_payment_id text,
  utr text,
  payer_vpa text,
  payer_name text,
  paid_on_claimed date,
  -- Object path in the private 'payment-proofs' bucket, never a URL.
  proof_object_path text,
  proof_channel text CHECK (proof_channel IS NULL OR proof_channel IN ('upload', 'whatsapp')),
  proof_sha256 text,
  matched_credit_id uuid,
  review_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_at timestamptz,
  review_decision text CHECK (review_decision IS NULL OR review_decision IN ('verify', 'reject')),
  review_note text,
  statement_checked boolean NOT NULL DEFAULT false,
  failure_code text,
  failure_reason text,
  expires_at timestamptz,
  idempotency_key text,
  client_ip_hash text,
  client_ua text,
  legacy_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_intent_state ON public.payment_attempts(intent_id, state);
-- Paise tags are allocated by this index: two open instant-UPI orders can never ask for the same amount.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_open_amount_key
  ON public.payment_attempts(amount_paise) WHERE state = 'awaiting_credit' AND method = 'upi_auto';
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_provider_order_key
  ON public.payment_attempts(provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_idempotency_key
  ON public.payment_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;
-- One UTR backs one live attempt. Rejected, failed and cancelled attempts free it.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_live_utr_key
  ON public.payment_attempts(utr) WHERE utr IS NOT NULL AND state IN ('awaiting_review', 'succeeded', 'disputed');
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_legacy_ref_key
  ON public.payment_attempts(legacy_ref) WHERE legacy_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_proof_sha ON public.payment_attempts(proof_sha256) WHERE proof_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_expiry ON public.payment_attempts(expires_at) WHERE expires_at IS NOT NULL AND state = 'awaiting_credit';

DO $$ BEGIN
  ALTER TABLE public.payment_intents
    ADD CONSTRAINT payment_intents_paid_attempt_fk FOREIGN KEY (paid_attempt_id) REFERENCES public.payment_attempts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. bank_credit_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('sms', 'email', 'razorpay', 'statement_import', 'manual')),
  source_ref text NOT NULL,
  receiving_account text,
  utr text,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  payer_vpa text,
  payer_name text,
  credited_at timestamptz NOT NULL,
  raw_redacted text,
  signature_ok boolean,
  parser_version text,
  matched_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  match_kind text CHECK (match_kind IS NULL OR match_kind IN ('auto', 'staff', 'statement')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confidence text NOT NULL DEFAULT 'single_channel' CHECK (confidence IN ('single_channel', 'two_channel')),
  sources text[] NOT NULL DEFAULT '{}',
  ignored_at timestamptz,
  ignored_reason text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_credit_events_source_ref_key ON public.bank_credit_events(source, source_ref);
CREATE UNIQUE INDEX IF NOT EXISTS bank_credit_events_utr_key ON public.bank_credit_events(utr) WHERE utr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_credit_events_amount ON public.bank_credit_events(amount_paise, credited_at);
CREATE INDEX IF NOT EXISTS idx_bank_credit_events_unmatched ON public.bank_credit_events(received_at) WHERE matched_attempt_id IS NULL AND ignored_at IS NULL;

DO $$ BEGIN
  ALTER TABLE public.payment_attempts
    ADD CONSTRAINT payment_attempts_matched_credit_fk FOREIGN KEY (matched_credit_id) REFERENCES public.bank_credit_events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. payment_outbox, payment_events, webhook_inbox, watcher_heartbeats ────
CREATE TABLE IF NOT EXISTS public.payment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  job text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  UNIQUE (aggregate_id, job)
);
CREATE INDEX IF NOT EXISTS idx_payment_outbox_due ON public.payment_outbox(next_run_at) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('student', 'staff', 'system', 'webhook', 'observer')),
  actor_id uuid,
  action text NOT NULL,
  intent_id uuid,
  attempt_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_attempt ON public.payment_events(attempt_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_intent ON public.payment_events(intent_id, created_at);

CREATE TABLE IF NOT EXISTS public.webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('razorpay', 'observer_sms', 'observer_email', 'observer_heartbeat')),
  event_id text NOT NULL,
  signature_ok boolean NOT NULL DEFAULT false,
  headers_redacted jsonb,
  body jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_unprocessed ON public.webhook_inbox(received_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.watcher_heartbeats (
  source text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz,
  app_version text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Server routes use the service role. Nobody reads these with the anon or user key.
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_credit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watcher_heartbeats ENABLE ROW LEVEL SECURITY;

-- ─── 5. Existing tables ──────────────────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convenience_fee numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_order_id_key
  ON public.payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_attempt ON public.payments(attempt_id) WHERE attempt_id IS NOT NULL;

ALTER TABLE public.direct_enrollment_links
  ADD COLUMN IF NOT EXISTS details_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_of_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL;

-- ─── 6. payments_transition: the only way an attempt changes state ───────────
-- Checks the expected state under a row lock, applies a patch of allowed columns,
-- writes the audit row and the outbox jobs, and marks the intent paid exactly once.
-- Returns { ok, code?, state?, attempt?, duplicate? }.
CREATE OR REPLACE FUNCTION public.payments_transition(
  p_attempt_id uuid,
  p_from_states text[],
  p_to_state text,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_actor_type text DEFAULT 'system',
  p_actor_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_jobs jsonb DEFAULT '[]'::jsonb,
  p_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before public.payment_attempts%ROWTYPE;
  v_after public.payment_attempts%ROWTYPE;
  v_job jsonb;
  v_duplicate boolean := false;
  v_patch jsonb := COALESCE(p_patch, '{}'::jsonb);
BEGIN
  SELECT * INTO v_before FROM public.payment_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF NOT (v_before.state = ANY (p_from_states)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_STATE', 'state', v_before.state);
  END IF;

  UPDATE public.payment_attempts SET
    state = p_to_state,
    updated_at = now(),
    utr = CASE WHEN v_patch ? 'utr' THEN v_patch->>'utr' ELSE utr END,
    payer_vpa = CASE WHEN v_patch ? 'payer_vpa' THEN v_patch->>'payer_vpa' ELSE payer_vpa END,
    payer_name = CASE WHEN v_patch ? 'payer_name' THEN v_patch->>'payer_name' ELSE payer_name END,
    paid_on_claimed = CASE WHEN v_patch ? 'paid_on_claimed' THEN (v_patch->>'paid_on_claimed')::date ELSE paid_on_claimed END,
    proof_object_path = CASE WHEN v_patch ? 'proof_object_path' THEN v_patch->>'proof_object_path' ELSE proof_object_path END,
    proof_channel = CASE WHEN v_patch ? 'proof_channel' THEN v_patch->>'proof_channel' ELSE proof_channel END,
    proof_sha256 = CASE WHEN v_patch ? 'proof_sha256' THEN v_patch->>'proof_sha256' ELSE proof_sha256 END,
    matched_credit_id = CASE WHEN v_patch ? 'matched_credit_id' THEN (v_patch->>'matched_credit_id')::uuid ELSE matched_credit_id END,
    review_by = CASE WHEN v_patch ? 'review_by' THEN (v_patch->>'review_by')::uuid ELSE review_by END,
    review_at = CASE WHEN v_patch ? 'review_at' THEN (v_patch->>'review_at')::timestamptz ELSE review_at END,
    review_decision = CASE WHEN v_patch ? 'review_decision' THEN v_patch->>'review_decision' ELSE review_decision END,
    review_note = CASE WHEN v_patch ? 'review_note' THEN v_patch->>'review_note' ELSE review_note END,
    statement_checked = CASE WHEN v_patch ? 'statement_checked' THEN COALESCE((v_patch->>'statement_checked')::boolean, false) ELSE statement_checked END,
    failure_code = CASE WHEN v_patch ? 'failure_code' THEN v_patch->>'failure_code' ELSE failure_code END,
    failure_reason = CASE WHEN v_patch ? 'failure_reason' THEN v_patch->>'failure_reason' ELSE failure_reason END,
    provider = CASE WHEN v_patch ? 'provider' THEN v_patch->>'provider' ELSE provider END,
    provider_order_id = CASE WHEN v_patch ? 'provider_order_id' THEN v_patch->>'provider_order_id' ELSE provider_order_id END,
    provider_payment_id = CASE WHEN v_patch ? 'provider_payment_id' THEN v_patch->>'provider_payment_id' ELSE provider_payment_id END,
    expires_at = CASE WHEN v_patch ? 'expires_at' THEN (v_patch->>'expires_at')::timestamptz ELSE expires_at END,
    metadata = CASE WHEN v_patch ? 'metadata' THEN metadata || COALESCE(v_patch->'metadata', '{}'::jsonb) ELSE metadata END
  WHERE id = p_attempt_id
  RETURNING * INTO v_after;

  INSERT INTO public.payment_events (actor_type, actor_id, action, intent_id, attempt_id, before, after, ip_hash)
  VALUES (
    COALESCE(p_actor_type, 'system'), p_actor_id,
    COALESCE(p_action, v_before.state || '->' || p_to_state),
    v_after.intent_id, v_after.id,
    jsonb_build_object('state', v_before.state, 'utr', v_before.utr, 'proof_object_path', v_before.proof_object_path, 'review_decision', v_before.review_decision),
    jsonb_build_object('state', v_after.state, 'utr', v_after.utr, 'proof_object_path', v_after.proof_object_path, 'review_decision', v_after.review_decision, 'patch', v_patch - 'client_ua'),
    p_ip_hash
  );

  IF p_to_state = 'succeeded' THEN
    UPDATE public.payment_intents
       SET status = 'paid', paid_attempt_id = v_after.id, paid_at = now(), updated_at = now()
     WHERE id = v_after.intent_id AND status = 'open';
    IF NOT FOUND THEN
      -- Money arrived for an intent that is already paid (or closed): never fulfil twice.
      v_duplicate := true;
      INSERT INTO public.payment_outbox (aggregate_type, aggregate_id, job, payload)
      VALUES ('attempt', v_after.id, 'flag_duplicate', jsonb_build_object('intent_id', v_after.intent_id))
      ON CONFLICT (aggregate_id, job) DO NOTHING;
    END IF;
  END IF;

  IF p_jobs IS NOT NULL AND jsonb_typeof(p_jobs) = 'array' THEN
    FOR v_job IN SELECT * FROM jsonb_array_elements(p_jobs) LOOP
      -- Fulfilment is skipped for a duplicate success; the rest (receipt, emails) is the caller's call.
      IF v_duplicate AND v_job->>'job' = 'fulfil_intent' THEN CONTINUE; END IF;
      INSERT INTO public.payment_outbox (aggregate_type, aggregate_id, job, payload, next_run_at)
      VALUES (
        COALESCE(v_job->>'aggregate_type', 'attempt'),
        COALESCE((v_job->>'aggregate_id')::uuid, v_after.id),
        v_job->>'job',
        COALESCE(v_job->'payload', '{}'::jsonb),
        COALESCE((v_job->>'run_at')::timestamptz, now())
      )
      ON CONFLICT (aggregate_id, job) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'attempt', to_jsonb(v_after), 'duplicate', v_duplicate);
END;
$$;

REVOKE ALL ON FUNCTION public.payments_transition(uuid, text[], text, jsonb, text, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ─── 7. payments_claim_outbox: lock a batch of due jobs for one processor run ─
CREATE OR REPLACE FUNCTION public.payments_claim_outbox(p_limit integer DEFAULT 20, p_lock_seconds integer DEFAULT 120)
RETURNS SETOF public.payment_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.payment_outbox o
     SET status = 'processing',
         locked_until = now() + make_interval(secs => p_lock_seconds),
         attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT id FROM public.payment_outbox
      WHERE (status = 'pending' AND next_run_at <= now())
         OR (status = 'processing' AND locked_until < now())
      ORDER BY next_run_at
      LIMIT GREATEST(1, LEAST(p_limit, 200))
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.payments_claim_outbox(integer, integer) FROM PUBLIC, anon, authenticated;

-- ─── 8. Settings ─────────────────────────────────────────────────────────────
INSERT INTO public.site_settings (key, value, updated_at) VALUES
  ('payment_methods', jsonb_build_object(
    'upi_auto', jsonb_build_object('enabled', false, 'shadowMode', true, 'orderMinutes', 30, 'instantCapPaise', 5000000, 'twoChannelAbovePaise', 3000000, 'silentAfterMinutes', 10),
    'upi_proof', jsonb_build_object('enabled', true),
    'bank_proof', jsonb_build_object('enabled', true),
    'razorpay', jsonb_build_object('enabled', false, 'feePercent', 2.36)
  ), now()),
  ('payment_watchers', jsonb_build_object('smsSenderIds', '[]'::jsonb, 'emailFromDomains', '[]'::jsonb, 'deviceIds', '[]'::jsonb), now()),
  ('payment_qr_codes', '[]'::jsonb, now()),
  ('enrolment_link_days', jsonb_build_object('days', 14), now())
ON CONFLICT (key) DO NOTHING;

UPDATE public.site_settings
   SET value = value || jsonb_build_object('whatsappNumber', NULL)
 WHERE key = 'payment_payee' AND NOT (value ? 'whatsappNumber');

-- ─── 9. Backfill: today's student-pays links and balance claims become intents + attempts ─
-- Idempotent through legacy_ref. Links with no plan chosen yet have nothing to backfill.
-- Guards beyond legacy_ref: a re-run after live (bridge) rows exist must not trip
-- payment_intents_one_open_per_link or payment_attempts_live_utr_key.
INSERT INTO public.payment_intents (purpose, enrollment_link_id, lead_profile_id, user_id, scheme, amount_paise, status, expires_at, legacy_ref, metadata, created_at)
SELECT 'enrolment', l.id, l.lead_profile_id, COALESCE(l.submitted_user_id, l.used_by, l.user_id), l.chosen_scheme,
       ROUND(COALESCE(l.submitted_amount, CASE l.chosen_scheme WHEN 'full' THEN l.offer_full_amount ELSE l.offer_installment_1 END) * 100)::bigint,
       CASE l.status::text WHEN 'used' THEN 'paid' WHEN 'expired' THEN 'expired' WHEN 'cancelled' THEN 'cancelled' ELSE 'open' END,
       l.expires_at, 'link:' || l.id, jsonb_build_object('link_id', l.id, 'legacy', true), COALESCE(l.submitted_at, l.created_at)
  FROM public.direct_enrollment_links l
 WHERE l.payment_mode = 'student_pays'
   AND l.chosen_scheme IS NOT NULL
   AND COALESCE(l.submitted_amount, CASE l.chosen_scheme WHEN 'full' THEN l.offer_full_amount ELSE l.offer_installment_1 END, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.payment_intents x WHERE x.enrollment_link_id = l.id)
ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;

INSERT INTO public.payment_attempts (intent_id, method, state, amount_paise, utr, paid_on_claimed, proof_object_path, proof_channel,
                                     review_by, review_at, review_decision, review_note, statement_checked, legacy_ref, metadata, created_at)
SELECT i.id,
       CASE l.submitted_method WHEN 'bank_transfer' THEN 'bank_proof' ELSE 'upi_proof' END,
       CASE l.status::text WHEN 'used' THEN 'succeeded' WHEN 'payment_submitted' THEN 'awaiting_review' ELSE 'rejected' END,
       i.amount_paise,
       CASE WHEN l.status::text IN ('used', 'payment_submitted') THEN l.submitted_utr ELSE NULL END,
       l.submitted_paid_on,
       NULLIF(split_part(regexp_replace(l.submitted_proof_url, '^.*/payment-proofs/', ''), '?', 1), l.submitted_proof_url),
       'upload',
       l.verified_by, l.verified_at,
       CASE l.status::text WHEN 'used' THEN 'verify' WHEN 'payment_submitted' THEN NULL ELSE 'reject' END,
       CASE l.status::text WHEN 'payment_submitted' THEN NULL ELSE l.rejection_reason END,
       l.status::text = 'used',
       'link:' || l.id, jsonb_build_object('link_id', l.id, 'legacy', true), l.submitted_at
  FROM public.direct_enrollment_links l
  JOIN public.payment_intents i ON i.legacy_ref = 'link:' || l.id
 WHERE l.payment_mode = 'student_pays' AND l.submitted_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.intent_id = i.id)
   AND NOT EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.utr = l.submitted_utr AND a.state IN ('awaiting_review', 'succeeded', 'disputed'))
ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;

INSERT INTO public.payment_intents (purpose, installment_id, lead_profile_id, user_id, scheme, amount_paise, status, legacy_ref, metadata, created_at)
SELECT DISTINCT ON (COALESCE(c.installment_id::text, c.user_id::text))
       'installment', c.installment_id, c.lead_profile_id, c.user_id, 'installment', ROUND(c.amount * 100)::bigint,
       CASE WHEN EXISTS (SELECT 1 FROM public.fee_payment_claims v WHERE v.status = 'verified'
                           AND COALESCE(v.installment_id::text, v.user_id::text) = COALESCE(c.installment_id::text, c.user_id::text)) THEN 'paid' ELSE 'open' END,
       'claim-intent:' || COALESCE(c.installment_id::text, c.user_id::text), jsonb_build_object('installment_number', c.installment_number, 'legacy', true), c.created_at
  FROM public.fee_payment_claims c
 WHERE NOT EXISTS (SELECT 1 FROM public.payment_intents x WHERE x.status = 'open' AND x.installment_id IS NOT DISTINCT FROM c.installment_id AND x.user_id = c.user_id)
 ORDER BY COALESCE(c.installment_id::text, c.user_id::text), c.created_at
ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;

INSERT INTO public.payment_attempts (intent_id, method, state, amount_paise, utr, paid_on_claimed, proof_object_path, proof_channel,
                                     review_by, review_at, review_decision, review_note, statement_checked, legacy_ref, metadata, created_at)
SELECT i.id,
       CASE c.method WHEN 'bank_transfer' THEN 'bank_proof' ELSE 'upi_proof' END,
       CASE c.status WHEN 'verified' THEN 'succeeded' WHEN 'pending' THEN 'awaiting_review' ELSE 'rejected' END,
       ROUND(c.amount * 100)::bigint,
       CASE WHEN c.status IN ('verified', 'pending') THEN c.utr ELSE NULL END,
       c.paid_on,
       NULLIF(split_part(regexp_replace(c.proof_url, '^.*/payment-proofs/', ''), '?', 1), c.proof_url),
       'upload',
       c.verified_by, c.verified_at,
       CASE c.status WHEN 'verified' THEN 'verify' WHEN 'rejected' THEN 'reject' ELSE NULL END,
       c.rejection_reason,
       c.status = 'verified',
       'claim:' || c.id, jsonb_build_object('claim_id', c.id, 'legacy', true), c.created_at
  FROM public.fee_payment_claims c
  JOIN public.payment_intents i ON i.legacy_ref = 'claim-intent:' || COALESCE(c.installment_id::text, c.user_id::text)
 WHERE NOT EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.legacy_ref = 'claim:' || c.id)
   AND (c.status NOT IN ('verified', 'pending')
        OR NOT EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.utr = c.utr AND a.state IN ('awaiting_review', 'succeeded', 'disputed')))
ON CONFLICT (legacy_ref) WHERE legacy_ref IS NOT NULL DO NOTHING;

UPDATE public.payment_intents i
   SET paid_attempt_id = a.id, paid_at = COALESCE(a.review_at, a.created_at)
  FROM public.payment_attempts a
 WHERE a.intent_id = i.id AND a.state = 'succeeded' AND i.status = 'paid' AND i.paid_attempt_id IS NULL;

UPDATE public.payments p
   SET attempt_id = a.id
  FROM public.payment_attempts a
  JOIN public.direct_enrollment_links l ON a.legacy_ref = 'link:' || l.id
 WHERE p.idempotency_key = 'direct-link:' || l.id AND p.attempt_id IS NULL;

UPDATE public.payments p
   SET attempt_id = a.id
  FROM public.payment_attempts a
  JOIN public.fee_payment_claims c ON a.legacy_ref = 'claim:' || c.id
 WHERE p.idempotency_key = 'fee-claim:' || c.id AND p.attempt_id IS NULL;
