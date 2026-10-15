-- SEO Health: record the Indexing API job ("Ask Google" sent automatically each
-- morning) as its own run kind. Only widens the check; no data changes.

ALTER TABLE public.seo_audit_runs DROP CONSTRAINT IF EXISTS seo_audit_runs_kind_check;
ALTER TABLE public.seo_audit_runs
  ADD CONSTRAINT seo_audit_runs_kind_check
  CHECK (kind IN ('search', 'inspect', 'crawl', 'analyze', 'digest', 'sitemaps', 'indexing'));
