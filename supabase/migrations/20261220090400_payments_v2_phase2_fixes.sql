-- Payments v2, Phase 2 review fixes (2026-10-20)
--   1. One bank credit can settle at most one live attempt. assignCredit, the
--      matcher and the sweep all read-then-write; this index makes the second
--      writer fail inside payments_transition(), which rolls back.
--   2. One open Instant UPI order per intent. Two tabs starting an order at
--      the same moment used to get two tags; the loser now supersedes.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_live_per_credit
  ON public.payment_attempts (matched_credit_id)
  WHERE matched_credit_id IS NOT NULL AND state IN ('awaiting_review', 'succeeded', 'disputed');

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_open_order_per_intent
  ON public.payment_attempts (intent_id)
  WHERE method = 'upi_auto' AND state = 'awaiting_credit';
