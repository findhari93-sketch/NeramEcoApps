-- ============================================================================
-- MARKETING INTELLIGENCE: KEYWORD BIDS (MANUAL CPC)
--
-- The live account bids by hand (Manual CPC), so a keyword's max CPC is the
-- main lever. Two new recommendation categories, like the budget pair:
--   bid_cut    lower a keyword's max CPC; automatic from day one (user decision,
--              2026-10-06), never below Rs 5, never a protected keyword
--   bid_raise  raise it within the guardrail and the CPC ceiling; needs approval
--
-- Code: apps/admin/src/lib/marketing-ai/rules.ts (R17), actions.ts
-- ============================================================================

ALTER TABLE public.marketing_ai_recommendations DROP CONSTRAINT IF EXISTS marketing_ai_recommendations_category_check;
ALTER TABLE public.marketing_ai_recommendations ADD CONSTRAINT marketing_ai_recommendations_category_check CHECK (
  category IN ('add_negative', 'pause_keyword', 'budget_cut', 'budget_raise', 'bid_cut', 'bid_raise', 'add_keyword', 'new_ad', 'pause_ad', 'ad_schedule', 'location', 'device_bid', 'alert', 'insight')
);

-- The seeded autonomy row predates the bid categories. Add them where an admin
-- has not set them yet: cuts automatic, raises on approval.
UPDATE public.marketing_ai_settings
-- Right side wins in ||, so an admin's existing choice is kept.
SET value = jsonb_set(value, '{categories}', '{"bid_cut": "auto", "bid_raise": "approve"}'::jsonb || COALESCE(value->'categories', '{}'::jsonb)),
    updated_at = now()
WHERE key = 'autonomy'
  AND NOT (COALESCE(value->'categories', '{}'::jsonb) ? 'bid_cut' AND COALESCE(value->'categories', '{}'::jsonb) ? 'bid_raise');
