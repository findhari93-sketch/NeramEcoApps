/**
 * SEO Health types. The tables are not in the generated Supabase types, so the
 * row shapes live here and the database client stays loosely typed in store.ts.
 */

export type FindingCategory = 'indexing' | 'performance' | 'onsite' | 'aeo';
export type Severity = 'critical' | 'high' | 'medium' | 'info';
export type FindingStatus = 'open' | 'fixed' | 'ignored';
export type RunKind = 'search' | 'inspect' | 'crawl' | 'analyze' | 'digest' | 'sitemaps';
export type RunTrigger = 'cron' | 'manual';
export type RunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'not_connected';

/** One row of seo_url_status. */
export interface UrlStatus {
  url: string;
  source: 'sitemap' | 'search' | 'import';
  sitemap: string | null;
  sitemap_lastmod: string | null;
  expected_index: boolean;
  priority_inspect: boolean;
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_txt_state: string | null;
  page_fetch_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  last_crawl_time: string | null;
  inspected_at: string | null;
  inspected_lastmod: string | null;
  inspect_error: string | null;
  http_status: number | null;
  redirect_to: string | null;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  robots_meta: string | null;
  x_robots_tag: string | null;
  h1_count: number | null;
  jsonld_types: string[] | null;
  jsonld_errors: number | null;
  word_count: number | null;
  answer_first: boolean | null;
  broken_links: string[] | null;
  crawled_at: string | null;
  crawl_error: string | null;
}

/** Totals for a page over a window (seo_page_window). */
export interface PageWindow {
  page: string;
  clicks: number;
  impressions: number;
  avg_position: number;
}

/** Totals for a query on a page over a window (seo_query_page_window). */
export interface QueryPageWindow extends PageWindow {
  query: string;
}

/** robots.txt and llms.txt as the crawler found them, per origin. */
export interface SiteFiles {
  origin: string;
  robotsStatus: number | null;
  robotsTxt: string | null;
  llmsStatus: number | null;
  llmsTxt: string | null;
}

/** What a rule produces. `substance` decides whether an ignored finding reopens. */
export interface Finding {
  fingerprint: string;
  rule_id: string;
  category: FindingCategory;
  severity: Severity;
  url: string | null;
  title: string;
  detail: Record<string, unknown>;
  substance: string;
}

export interface RuleInput {
  urls: UrlStatus[];
  /** Last 28 days of complete data. */
  pages28: PageWindow[];
  /** Last 7 days and the 7 before them, for drops. */
  pagesLast7: PageWindow[];
  pagesPrev7: PageWindow[];
  queries28: QueryPageWindow[];
  sites: SiteFiles[];
}

/** One row of seo_findings as stored. */
export interface FindingRow {
  id: string;
  fingerprint: string;
  rule_id: string;
  category: FindingCategory;
  severity: Severity;
  url: string | null;
  title: string;
  detail: Record<string, unknown>;
  detail_hash: string | null;
  status: FindingStatus;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  ignored_by: string | null;
  ignore_note: string | null;
}
