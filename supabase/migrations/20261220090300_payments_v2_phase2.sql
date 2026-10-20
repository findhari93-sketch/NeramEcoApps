-- Payments v2, Phase 2: Instant UPI confirmed from bank alerts, shadow mode first.
--   bank_credit_events.shadow_attempt_id  the attempt a credit WOULD have confirmed while shadow mode is on
--   bank_credit_events.metadata           parser extras (payer hint, note, account tail)
--   webhook_inbox.device_id               which watcher sent it
--   watcher_heartbeats.silent_notified_at  staff were told once about this silence

ALTER TABLE public.bank_credit_events
  ADD COLUMN IF NOT EXISTS shadow_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.webhook_inbox
  ADD COLUMN IF NOT EXISTS device_id text;

ALTER TABLE public.watcher_heartbeats
  ADD COLUMN IF NOT EXISTS silent_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bank_credit_events_shadow ON public.bank_credit_events(shadow_attempt_id) WHERE shadow_attempt_id IS NOT NULL;

-- Instant UPI starts switched off and in shadow mode; the founder flips it in Settings after the ₹1 test.
UPDATE public.site_settings
   SET value = jsonb_set(value, '{upi_auto,shadowMode}', 'true'::jsonb, true)
 WHERE key = 'payment_methods' AND NOT (value->'upi_auto' ? 'shadowMode');
