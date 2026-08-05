-- ============================================
-- AI USAGE TRACKING AND SPEND ATTRIBUTION
-- Gemini is called from sixteen places across marketing, nexus and admin, and
-- until now not one of them recorded anything. Nobody could answer "which
-- feature spent the most this month", and nothing in the code stopped a bad
-- afternoon from running up a bill. The key is on Tier 1, so every token is
-- charged from the first request: there is no free allowance absorbing this.
--
-- Two tables, the same state-plus-events split as nexus_student_watchlist:
--
--   ai_usage_events  append-only, one row per Gemini call. The drill-down, and
--                    the only place the error text and the actor survive.
--   ai_usage_daily   rollup, upserted on every write. One row per
--                    (day, app, feature, model).
--
-- The rollup is not an optimisation, it is what makes the budget guard possible
-- at all. The guard runs BEFORE every AI call, so it has to be one cheap
-- indexed read. Summing ai_usage_events on each call would put a growing table
-- scan in front of every request, and on a serverless platform there is no
-- in-process counter to fall back on: apps/nexus/src/lib/exam-recall-ai.ts
-- already learned that, its MAX_CALLS_PER_MINUTE limiter never fired because
-- each invocation got a fresh module scope.
--
-- Cost is stored, not derived. Prices change and models get retired, so a row
-- written today must keep the number it was actually charged. estimated_cost_usd
-- is NULL when the model was not in the price table, never 0: a zero would
-- silently understate the month and the cap would never trip.
--
-- Cross-app tables, so bare names like chatbot_conversations and
-- tool_usage_logs, not the nexus_ prefix.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches an id in packages/ai/src/features.ts. Text rather than an enum so
  -- adding a feature never needs a migration; the typed union in that file is
  -- what stops a typo reaching here.
  feature_id          TEXT NOT NULL,
  app                 TEXT NOT NULL CHECK (app IN ('marketing', 'nexus', 'admin')),
  -- The model that actually answered, which is not always the one asked for:
  -- the client falls through to the next model on 404 and 429, and a fallback
  -- can be pricier than the primary. Recording it is how that stays visible.
  model               TEXT,
  -- 'paid' or 'free', for when a second unbilled key is in play.
  key_tier            TEXT NOT NULL DEFAULT 'paid' CHECK (key_tier IN ('paid', 'free')),
  prompt_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  total_tokens        INTEGER NOT NULL DEFAULT 0,
  -- NULL means the model had no known price. See the note above.
  estimated_cost_usd  NUMERIC(12, 6),
  latency_ms          INTEGER,
  -- blocked_budget and manual rows cost nothing but are the most interesting
  -- ones on the panel: they are the work the controls actually prevented.
  status              TEXT NOT NULL CHECK (status IN (
                        'ok', 'error', 'rate_limited', 'blocked_budget', 'manual')),
  error               TEXT,
  actor_id            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Salted hash identifying one anonymous visitor, for the public chatbots.
  -- Those endpoints have no login, so actor_id is always NULL there and there
  -- would otherwise be nothing to rate limit against. Hashed rather than
  -- storing the raw IP: the only thing needed is "is this the same visitor as
  -- a minute ago", which a hash answers without keeping the address.
  client_key          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created
  ON public.ai_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feature
  ON public.ai_usage_events (feature_id, created_at DESC);

-- Public chatbots are unauthenticated, so actor_id is usually NULL there. This
-- index only serves the authenticated per-user drill-down.
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_actor
  ON public.ai_usage_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Serves the per-visitor rate limit on the public chatbots, which runs before
-- every one of their calls and must stay a single index hit.
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_client
  ON public.ai_usage_events (client_key, created_at DESC)
  WHERE client_key IS NOT NULL;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UTC date. Google's own quota day resets at midnight Pacific, so these two
  -- will not line up exactly; the panel is for spotting which feature is
  -- expensive, not for reconciling Google's invoice to the cent.
  day            DATE NOT NULL,
  app            TEXT NOT NULL,
  feature_id     TEXT NOT NULL,
  model          TEXT NOT NULL DEFAULT '',
  calls          INTEGER NOT NULL DEFAULT 0,
  -- Calls the guard refused. Counted separately so a feature pinned at its cap
  -- reads as "being held back" rather than "quiet".
  blocked_calls  INTEGER NOT NULL DEFAULT 0,
  prompt_tokens  BIGINT NOT NULL DEFAULT 0,
  output_tokens  BIGINT NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The upsert target. model is NOT NULL DEFAULT '' rather than nullable
  -- because a NULL inside a UNIQUE constraint never conflicts, so blocked rows
  -- (which have no model) would insert a new row every single time.
  UNIQUE (day, app, feature_id, model)
);

-- The budget guard's only read: today's spend, and this month's.
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_day
  ON public.ai_usage_daily (day DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_feature
  ON public.ai_usage_daily (feature_id, day DESC);

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Accumulate a call into the rollup in one statement. Doing this in SQL rather
-- than read-modify-write in TypeScript matters: several serverless invocations
-- finish at once, and a read-then-write would lose counts to the last writer.
CREATE OR REPLACE FUNCTION public.record_ai_usage_daily(
  p_day           DATE,
  p_app           TEXT,
  p_feature_id    TEXT,
  p_model         TEXT,
  p_calls         INTEGER,
  p_blocked       INTEGER,
  p_prompt_tokens BIGINT,
  p_output_tokens BIGINT,
  p_cost_usd      NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ai_usage_daily AS d (
    day, app, feature_id, model, calls, blocked_calls,
    prompt_tokens, output_tokens, cost_usd, updated_at
  )
  VALUES (
    p_day, p_app, p_feature_id, COALESCE(p_model, ''), p_calls, p_blocked,
    p_prompt_tokens, p_output_tokens, COALESCE(p_cost_usd, 0), now()
  )
  ON CONFLICT (day, app, feature_id, model) DO UPDATE SET
    calls         = d.calls + EXCLUDED.calls,
    blocked_calls = d.blocked_calls + EXCLUDED.blocked_calls,
    prompt_tokens = d.prompt_tokens + EXCLUDED.prompt_tokens,
    output_tokens = d.output_tokens + EXCLUDED.output_tokens,
    cost_usd      = d.cost_usd + EXCLUDED.cost_usd,
    updated_at    = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.ai_usage_events IS
  'One row per Gemini call. Append-only drill-down behind the AI usage panel.';
COMMENT ON TABLE public.ai_usage_daily IS
  'Per-day rollup of ai_usage_events. Read by the budget guard before every AI call.';
COMMENT ON COLUMN public.ai_usage_events.estimated_cost_usd IS
  'NULL when the model had no known price. Never 0, which would understate spend.';

NOTIFY pgrst, 'reload schema';
