-- SEO Health, round 2.
--
-- 1. seo_findings.status gains 'waiting': fixed on our side (our crawl says the
--    page works, has the right canonical, robots.txt allows it) while Google's
--    last look still shows the old problem. Not counted as an issue; it moves to
--    'fixed' when Google re-crawls.
-- 2. seo_url_status.index_requested_at: when staff last pressed "Request
--    indexing" in Search Console for the URL (the API cannot request indexing,
--    so Admin keeps a short daily list and remembers what was asked).

ALTER TABLE public.seo_findings DROP CONSTRAINT IF EXISTS seo_findings_status_check;
ALTER TABLE public.seo_findings
  ADD CONSTRAINT seo_findings_status_check CHECK (status IN ('open', 'waiting', 'fixed', 'ignored'));

ALTER TABLE public.seo_url_status ADD COLUMN IF NOT EXISTS index_requested_at timestamptz;
