-- ============================================================================
-- SEO Health: Google Search Console data + our own SEO/AEO audit.
--
-- WHY. Search Console showed 693 pages indexed and 3.8K not indexed, and
-- nobody was watching it. Once a day Admin pulls search performance and URL
-- Inspection results through the Search Console API (service account, read
-- only); once a week it crawls our own sitemaps. Pure rules turn that into a
-- findings list that resolves itself when an issue stops firing.
--
-- The API has no "Page indexing" totals, so index status is rebuilt per URL
-- with URL Inspection (2,000 a day per property) for our sitemap URLs, URLs
-- seen in search data and URLs pasted from a Search Console export.
--
-- Nothing runs until GSC_SERVICE_ACCOUNT_KEY is set; the cron then records a
-- "not_connected" run. Written to re-run safely.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seo_audit_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('search', 'inspect', 'crawl', 'analyze', 'digest', 'sitemaps')),
  trigger     text NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual')),
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'partial', 'failed', 'not_connected')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- What the run did, plus any cursor the next run continues from.
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text
);
CREATE INDEX IF NOT EXISTS seo_audit_runs_kind_idx ON public.seo_audit_runs (kind, started_at DESC);

-- Search performance per day, page, query and device (Search Console data is
-- final about 3 days after the date). Rows with query = '' are the page's own
-- totals: Google leaves anonymised queries out of query rows, so summing those
-- would undercount a page.
CREATE TABLE IF NOT EXISTS public.gsc_search_daily (
  date        date NOT NULL,
  page        text NOT NULL,
  query       text NOT NULL,
  device      text NOT NULL,
  clicks      integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr         double precision NOT NULL DEFAULT 0,
  position    double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (date, page, query, device)
);
CREATE INDEX IF NOT EXISTS gsc_search_daily_page_idx ON public.gsc_search_daily (page, date DESC);
CREATE INDEX IF NOT EXISTS gsc_search_daily_date_idx ON public.gsc_search_daily (date DESC);

-- One row per URL we know about: what our sitemap says, what Google's URL
-- Inspection says, and what our own crawler saw.
CREATE TABLE IF NOT EXISTS public.seo_url_status (
  url                text PRIMARY KEY,
  -- 'sitemap' | 'search' (seen only in search data) | 'import' (pasted by staff)
  source             text NOT NULL DEFAULT 'sitemap' CHECK (source IN ('sitemap', 'search', 'import')),
  sitemap            text,
  sitemap_lastmod    text,
  -- In a sitemap today, so we want it indexed.
  expected_index     boolean NOT NULL DEFAULT false,
  priority_inspect   boolean NOT NULL DEFAULT false,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),

  -- URL Inspection API (index status result)
  verdict            text,
  coverage_state     text,
  indexing_state     text,
  robots_txt_state   text,
  page_fetch_state   text,
  google_canonical   text,
  user_canonical     text,
  last_crawl_time    timestamptz,
  inspected_at       timestamptz,
  inspected_lastmod  text,
  inspect_error      text,

  -- Our crawler
  http_status        integer,
  redirect_to        text,
  title              text,
  meta_description   text,
  canonical          text,
  robots_meta        text,
  x_robots_tag       text,
  h1_count           integer,
  jsonld_types       text[],
  jsonld_errors      integer,
  word_count         integer,
  answer_first       boolean,
  broken_links       text[],
  crawled_at         timestamptz,
  crawl_error        text
);
CREATE INDEX IF NOT EXISTS seo_url_status_inspected_idx ON public.seo_url_status (inspected_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS seo_url_status_expected_idx ON public.seo_url_status (expected_index);

CREATE TABLE IF NOT EXISTS public.seo_findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- rule_id + url (or rule_id + subject for site-wide findings)
  fingerprint  text NOT NULL,
  rule_id      text NOT NULL,
  category     text NOT NULL CHECK (category IN ('indexing', 'performance', 'onsite', 'aeo')),
  severity     text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'info')),
  url          text,
  title        text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Changes when the substance of the finding changes; reopens an ignored one.
  detail_hash  text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored')),
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  ignored_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ignore_note  text
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_findings_fingerprint_key ON public.seo_findings (fingerprint);
CREATE INDEX IF NOT EXISTS seo_findings_status_idx ON public.seo_findings (status, severity);

-- Totals per page over a window. Position is impression weighted, as Search
-- Console reports it. Summed in SQL so the rules never page through raw rows.
CREATE OR REPLACE FUNCTION public.seo_page_window(p_from date, p_to date)
RETURNS TABLE (page text, clicks bigint, impressions bigint, avg_position double precision)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d.page,
         sum(d.clicks)::bigint,
         sum(d.impressions)::bigint,
         CASE WHEN sum(d.impressions) > 0 THEN sum(d.position * d.impressions) / sum(d.impressions) ELSE 0 END
  FROM public.gsc_search_daily d
  WHERE d.date BETWEEN p_from AND p_to AND d.query = ''
  GROUP BY d.page
$$;

-- Totals per query and page over a window, for queries with some volume.
CREATE OR REPLACE FUNCTION public.seo_query_page_window(p_from date, p_to date, p_min_impressions integer DEFAULT 10)
RETURNS TABLE (query text, page text, clicks bigint, impressions bigint, avg_position double precision)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d.query, d.page,
         sum(d.clicks)::bigint,
         sum(d.impressions)::bigint,
         CASE WHEN sum(d.impressions) > 0 THEN sum(d.position * d.impressions) / sum(d.impressions) ELSE 0 END
  FROM public.gsc_search_daily d
  WHERE d.date BETWEEN p_from AND p_to AND d.query <> ''
  GROUP BY d.query, d.page
  HAVING sum(d.impressions) >= p_min_impressions
$$;

-- Clicks and impressions per day, for the trend line.
CREATE OR REPLACE FUNCTION public.seo_daily_totals(p_from date, p_to date)
RETURNS TABLE (date date, clicks bigint, impressions bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d.date, sum(d.clicks)::bigint, sum(d.impressions)::bigint
  FROM public.gsc_search_daily d
  WHERE d.date BETWEEN p_from AND p_to AND d.query = ''
  GROUP BY d.date
  ORDER BY d.date
$$;

REVOKE ALL ON FUNCTION public.seo_page_window(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_query_page_window(date, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seo_daily_totals(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_page_window(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_query_page_window(date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.seo_daily_totals(date, date) TO service_role;

-- Service role only, default deny: Admin API routes and the crons read and write these.
ALTER TABLE public.seo_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gsc_search_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_url_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_findings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.seo_findings IS
  'SEO/AEO audit findings from Search Console data and our own crawl. Open findings are the to-do list; they resolve themselves when the rule stops firing.';

NOTIFY pgrst, 'reload schema';
