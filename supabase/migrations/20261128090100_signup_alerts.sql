-- New sign-up alerts: where the person signed up from, and staff phones to ping.

-- Approximate place of the sign-up request, from Cloudflare's (or Vercel's) IP
-- lookup headers. Filled once, when the account is created.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_city text,
  ADD COLUMN IF NOT EXISTS signup_state text,
  ADD COLUMN IF NOT EXISTS signup_country text,
  -- Set when the "New sign-up" alert went out (first verified phone of a new
  -- account), so it is sent once even when register-user and verify-phone race.
  ADD COLUMN IF NOT EXISTS signup_alert_sent_at timestamptz;

COMMENT ON COLUMN public.users.signup_state IS 'Approximate state at sign-up from the IP (Cloudflare cf-region). Mobile networks can report the carrier gateway.';

-- One row per staff device that turned on phone alerts in Admin > Settings >
-- Notifications (Web Push).
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_push_subscriptions_user ON public.admin_push_subscriptions(user_id);

-- Server only (service role). No policies: anon and signed-in browsers get nothing.
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_push_subscriptions FROM anon, authenticated;
