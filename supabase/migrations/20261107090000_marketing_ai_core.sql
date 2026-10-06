-- ============================================================================
-- MARKETING INTELLIGENCE: THE GOOGLE ADS AGENT
--
-- Spec: docs/NERAM_MARKETING_INTELLIGENCE_AI_AGENT.md
-- Code: apps/admin/src/lib/marketing-ai/
--
-- The flow is DATA -> RULES -> AI -> RECOMMENDATION -> APPROVAL -> ACTION ->
-- MEASUREMENT, and every arrow leaves a row behind:
--
--   ads_entity_daily              what Google Ads reported, per day per entity
--   marketing_ai_runs             each ingest / analyze / upload / execute job
--   marketing_ai_recommendations  what the rules found and what the AI said
--   marketing_ai_actions          each mutation sent to Google, with its reply
--   marketing_ai_audit_log        who did what, before and after (append only)
--   marketing_ai_settings         autonomy, targets and guardrails
--
-- All admin only. RLS on with no policies and anon/authenticated revoked: only
-- the admin app's service-role routes read or write these tables. Metrics a
-- person sees always come from ads_entity_daily, never from AI text.
-- ============================================================================

-- ── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ai_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Safe actions automatic from day one (blocking off-scope searches, cutting
-- budgets to hold the monthly cap, pausing keywords that waste money); every
-- change that spends more or changes what people see waits for an admin.
-- Monthly caps: Rs 7,000 off-season, Rs 40,000 in the March to June season.
-- conversions_since stays null until "Phone verified (Neram app)" is the
-- primary conversion in Google Ads; conversion-based rules wait for it.
INSERT INTO public.marketing_ai_settings (key, value) VALUES
  ('autonomy', '{"level": 2, "kill_switch": false, "categories": {"add_negative": "auto", "budget_cut": "auto", "pause_keyword": "auto", "budget_raise": "approve", "add_keyword": "approve", "new_ad": "approve", "pause_ad": "approve"}}'::jsonb),
  ('targets', '{"target_cpa_inr": 650, "monthly_spend_cap_inr": 7000, "conversions_since": null, "season": {"months": [3, 4, 5, 6], "target_cpa_inr": 650, "monthly_spend_cap_inr": 40000}}'::jsonb),
  ('guardrails', '{"max_budget_change_pct": 20, "max_auto_actions_per_day": 10, "min_clicks_to_judge": 10, "auto_min_confidence": 0.85, "auto_demote_cpa_worsening_pct": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Raw daily performance ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ads_entity_daily (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        text NOT NULL,
  date               date NOT NULL,
  level              text NOT NULL CHECK (level IN ('campaign', 'ad_group', 'keyword', 'search_term', 'device', 'ad', 'hour', 'geo')),
  -- Stable key within (customer, date, level): campaign id, "adGroupId~criterionId",
  -- "adGroupId~search term", "campaignId~DEVICE".
  entity_key         text NOT NULL,
  campaign_id        text,
  campaign_name      text,
  ad_group_id        text,
  ad_group_name      text,
  criterion_id       text,
  text               text,
  match_type         text,
  status             text,
  -- Campaign level only: the reason Google is holding it back, if any.
  primary_status     text,
  budget_micros      bigint,
  impressions        bigint NOT NULL DEFAULT 0,
  clicks             bigint NOT NULL DEFAULT 0,
  cost_micros        bigint NOT NULL DEFAULT 0,
  conversions        numeric NOT NULL DEFAULT 0,
  conversions_value  numeric NOT NULL DEFAULT 0,
  -- Level-specific extras: an ad's final_urls / ad_strength / approval, an
  -- hour row's day_of_week and hour, a geo row's city name.
  attributes         jsonb,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, date, level, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_ads_entity_daily_level_date ON public.ads_entity_daily (level, date DESC);
CREATE INDEX IF NOT EXISTS idx_ads_entity_daily_campaign ON public.ads_entity_daily (campaign_id, date DESC);

-- ── Runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ai_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('ingest', 'analyze', 'conversions', 'execute', 'autopilot', 'measure', 'weekly')),
  trigger         text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual')),
  triggered_by    uuid,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  mode            text,
  provider        text,
  model           text,
  prompt_version  text,
  tokens_in       integer,
  tokens_out      integer,
  cost_usd        numeric,
  stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
  error           text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_marketing_ai_runs_kind ON public.marketing_ai_runs (kind, started_at DESC);

-- ── Recommendations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ai_recommendations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id             text NOT NULL,
  category            text NOT NULL CHECK (category IN ('add_negative', 'pause_keyword', 'budget_cut', 'budget_raise', 'add_keyword', 'new_ad', 'pause_ad', 'ad_schedule', 'location', 'device_bid', 'alert', 'insight')),
  source              text NOT NULL DEFAULT 'google_ads',
  entity_type         text NOT NULL,
  entity_id           text NOT NULL,
  campaign_id         text,
  title               text NOT NULL,
  description         text,
  reason              text NOT NULL,
  priority            text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  risk_level          text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  estimated_impact    text,
  status              text NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
                        'detected', 'recommended', 'pending_approval', 'approved', 'rejected',
                        'executing', 'executed', 'failed', 'measured', 'expired')),
  proposed_change     jsonb,
  evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_assessment       text,
  ai_intent           text,
  confidence          numeric,
  dedupe_key          text NOT NULL,
  run_id              uuid REFERENCES public.marketing_ai_runs(id) ON DELETE SET NULL,
  decided_by          text,
  decided_at          timestamptz,
  decision_note       text,
  executed_at         timestamptz,
  execution_result    jsonb,
  measured_result     jsonb,
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One open recommendation per finding. A rejected or executed one does not
-- block the rule from raising it again later with fresh evidence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_ai_reco_open
  ON public.marketing_ai_recommendations (dedupe_key)
  WHERE status IN ('detected', 'recommended', 'pending_approval', 'approved', 'executing');
CREATE INDEX IF NOT EXISTS idx_marketing_ai_reco_status ON public.marketing_ai_recommendations (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_ai_reco_category ON public.marketing_ai_recommendations (category, status);

-- ── Actions (mutations sent to Google Ads) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_ai_actions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id      uuid REFERENCES public.marketing_ai_recommendations(id) ON DELETE SET NULL,
  operation              text NOT NULL,
  request                jsonb NOT NULL,
  validate_only          boolean NOT NULL DEFAULT true,
  validate_response      jsonb,
  response               jsonb,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'succeeded', 'failed', 'reverted')),
  -- users.id as text, or 'autopilot'.
  actor                  text NOT NULL,
  revert_payload         jsonb,
  reverted_by_action_id  uuid REFERENCES public.marketing_ai_actions(id) ON DELETE SET NULL,
  error                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_marketing_ai_actions_reco ON public.marketing_ai_actions (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_ai_actions_actor_day ON public.marketing_ai_actions (actor, created_at DESC);

-- ── Audit log ───────────────────────────────────────────────────────────────
-- Same shape as counseling_audit_log, widened for agent events.
CREATE TABLE IF NOT EXISTS public.marketing_ai_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor        text NOT NULL,
  actor_type   text NOT NULL CHECK (actor_type IN ('admin', 'autopilot', 'cron')),
  event        text NOT NULL,
  entity_type  text,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  reason       text,
  run_id       uuid,
  recommendation_id uuid,
  action_id    uuid,
  result       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_ai_audit_created ON public.marketing_ai_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_ai_audit_reco ON public.marketing_ai_audit_log (recommendation_id);

-- ── Weekly AI report ────────────────────────────────────────────────────────
-- One row per week (Monday, IST). The text passed the same number guard as the
-- recommendations; the numbers it rests on are kept beside it.
CREATE TABLE IF NOT EXISTS public.marketing_ai_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL UNIQUE,
  summary      text NOT NULL,
  next_steps   jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id       uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Lock down ───────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_entity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_ai_settings FROM anon, authenticated;
REVOKE ALL ON public.ads_entity_daily FROM anon, authenticated;
REVOKE ALL ON public.marketing_ai_runs FROM anon, authenticated;
REVOKE ALL ON public.marketing_ai_recommendations FROM anon, authenticated;
REVOKE ALL ON public.marketing_ai_actions FROM anon, authenticated;
REVOKE ALL ON public.marketing_ai_audit_log FROM anon, authenticated;
REVOKE ALL ON public.marketing_ai_reports FROM anon, authenticated;

GRANT ALL ON public.marketing_ai_settings TO service_role;
GRANT ALL ON public.ads_entity_daily TO service_role;
GRANT ALL ON public.marketing_ai_runs TO service_role;
GRANT ALL ON public.marketing_ai_recommendations TO service_role;
GRANT ALL ON public.marketing_ai_actions TO service_role;
GRANT ALL ON public.marketing_ai_audit_log TO service_role;
GRANT ALL ON public.marketing_ai_reports TO service_role;

NOTIFY pgrst, 'reload schema';
