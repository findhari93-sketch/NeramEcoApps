-- ============================================================================
-- One first-party event stream for every app.
--
-- user_funnel_events already has the spec's analytics_events columns. Rather
-- than a second table, widen it:
--   * funnel accepts the new journeys (tool, marketing, enrollment, feedback,
--     engagement). The ingest routes drop unknown values one by one
--     (@neram/database/analytics normalizeFunnelEvents), because a single bad
--     value used to make Postgres reject the whole batch.
--   * session_id groups one browser-tab session.
--   * analytics_events is a view with the spec's column names.
--   * the open INSERT policy (WITH CHECK true for every role) goes: every writer
--     is server-side with the service role.
-- auth_funnel_summary and get_user_last_auth_step are untouched.
-- ============================================================================

ALTER TABLE public.user_funnel_events DROP CONSTRAINT IF EXISTS chk_funnel;
ALTER TABLE public.user_funnel_events ADD CONSTRAINT chk_funnel CHECK (
  funnel IN ('auth', 'onboarding', 'application', 'tool', 'marketing', 'enrollment', 'feedback', 'engagement')
);

ALTER TABLE public.user_funnel_events ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS idx_funnel_events_event_created
  ON public.user_funnel_events (event, created_at DESC);

DROP POLICY IF EXISTS "Users can insert own events" ON public.user_funnel_events;

CREATE OR REPLACE VIEW public.analytics_events
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  anonymous_id,
  session_id,
  source_app  AS app_id,
  funnel,
  event       AS event_name,
  status,
  created_at  AS event_timestamp,
  page_url    AS page,
  device_type,
  browser,
  os,
  metadata
FROM public.user_funnel_events;

COMMENT ON VIEW public.analytics_events IS
  'The first-party event stream with the lifecycle spec''s column names. Rows live in user_funnel_events.';

REVOKE ALL ON public.analytics_events FROM anon, authenticated;
GRANT SELECT ON public.analytics_events TO service_role;

NOTIFY pgrst, 'reload schema';
