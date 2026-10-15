/**
 * Our own crawler. Fetches each URL the way a search engine first sees it (no
 * redirect following, server-rendered HTML only), records status, head tags,
 * JSON-LD, copy length and internal links, then checks the internal links it
 * found for 404s.
 *
 * Each page is re-crawled when its last crawl is over a week old; the daily
 * cron spends its spare time on the oldest ones, so no single run has to
 * fetch every page.
 */
import { parseHtml } from './html';
import { normUrl } from './rules';
import { db, loadUrlStatus, upsertBatches } from './store';
import type { SiteFiles, UrlStatus } from './types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const CRAWL_UA = 'Mozilla/5.0 (compatible; NeramSEOAudit/1.0; +https://neramclasses.com)';
const TIMEOUT_MS = 10_000;
const MAX_HTML = 3_000_000;
export const RECRAWL_AFTER_DAYS = 7;

export interface CrawlResult {
  url: string;
  http_status: number | null;
  redirect_to: string | null;
  x_robots_tag: string | null;
  title: string | null;
  meta_description: string | null;
  canonical: string | null;
  robots_meta: string | null;
  h1_count: number | null;
  jsonld_types: string[] | null;
  jsonld_errors: number | null;
  word_count: number | null;
  answer_first: boolean | null;
  crawl_error: string | null;
  internalLinks: string[];
}

const empty = (url: string): CrawlResult => ({
  url,
  http_status: null,
  redirect_to: null,
  x_robots_tag: null,
  title: null,
  meta_description: null,
  canonical: null,
  robots_meta: null,
  h1_count: null,
  jsonld_types: null,
  jsonld_errors: null,
  word_count: null,
  answer_first: null,
  crawl_error: null,
  internalLinks: [],
});

export async function crawlUrl(url: string, fetchImpl: FetchLike = fetch): Promise<CrawlResult> {
  const out = empty(url);
  try {
    const res = await fetchImpl(url, { redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': CRAWL_UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    out.http_status = res.status;
    out.x_robots_tag = res.headers.get('x-robots-tag');
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      out.redirect_to = loc ? new URL(loc, url).toString() : null;
      return out;
    }
    if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('html')) return out;
    const html = (await res.text()).slice(0, MAX_HTML);
    const snap = parseHtml(html, url);
    Object.assign(out, {
      title: snap.title,
      meta_description: snap.metaDescription,
      canonical: snap.canonical,
      robots_meta: snap.robotsMeta,
      h1_count: snap.h1Count,
      jsonld_types: snap.jsonldTypes,
      jsonld_errors: snap.jsonldErrors,
      word_count: snap.wordCount,
      answer_first: snap.answerFirst,
      internalLinks: snap.internalLinks,
    });
  } catch (e) {
    out.crawl_error = e instanceof Error ? (e.name === 'TimeoutError' ? 'timed out after 10s' : e.message) : 'fetch failed';
  }
  return out;
}

/** robots.txt and llms.txt for one origin, as anyone would fetch them. */
export async function fetchSiteFiles(origin: string, fetchImpl: FetchLike = fetch): Promise<SiteFiles> {
  const get = async (path: string) => {
    try {
      const res = await fetchImpl(`${origin}${path}`, { cache: 'no-store', headers: { 'User-Agent': CRAWL_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { status: res.status, text: res.ok ? (await res.text()).slice(0, 500_000) : null };
    } catch {
      return { status: null, text: null };
    }
  };
  const [robots, llms] = await Promise.all([get('/robots.txt'), get('/llms.txt')]);
  return { origin, robotsStatus: robots.status, robotsTxt: robots.text, llmsStatus: llms.status, llmsTxt: llms.text };
}

/** Runs `fn` over items with a fixed number in flight, stopping new work at the deadline. */
export async function pool<T, R>(items: T[], concurrency: number, deadline: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++];
      results.push(await fn(item));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Which URLs to crawl now: never crawled first, then the stalest, skipping those crawled this week. */
/** `only` limits the crawl to those URLs ("Check my fixes") and always re-crawls them. */
export function pickForCrawl(rows: UrlStatus[], now: Date, force = false, only?: string[]): string[] {
  const cutoff = now.getTime() - RECRAWL_AFTER_DAYS * 86_400_000;
  const scope = only ? new Set(only.map(normUrl)) : null;
  return rows
    .filter((r) => (scope ? scope.has(normUrl(r.url)) : r.expected_index || r.source === 'import' || r.source === 'search'))
    .filter((r) => force || !!scope || !r.crawled_at || Date.parse(r.crawled_at) < cutoff)
    .sort((a, b) => (a.crawled_at ? Date.parse(a.crawled_at) : 0) - (b.crawled_at ? Date.parse(b.crawled_at) : 0))
    .map((r) => r.url);
}

/**
 * Link checks for one run: links that were broken last time first (to see if
 * they are fixed), then the rest starting at a point that moves each day, so a
 * run that hits its deadline still covers every link over a few days.
 */
export function orderLinkChecks(links: string[], prevBroken: Set<string>, now: Date): string[] {
  const first = links.filter((l) => prevBroken.has(l));
  const rest = links.filter((l) => !prevBroken.has(l)).sort();
  const offset = rest.length ? (Math.floor(now.getTime() / 86_400_000) * 997) % rest.length : 0;
  return [...first, ...rest.slice(offset), ...rest.slice(0, offset)];
}

/** A page's broken links: 404s found now, plus last run's that were not re-checked and are still linked. */
export function brokenLinksFor(links: string[], prevBroken: string[], known: Map<string, number | null>): string[] {
  const linked = new Set(links);
  const out = new Set<string>();
  for (const l of links) if ([404, 410].includes(known.get(normUrl(l)) ?? 0)) out.add(l);
  for (const l of prevBroken) if (linked.has(l) && !known.has(normUrl(l))) out.add(l);
  return [...out];
}

export async function runCrawl(opts: { client?: any; deadline: number; fetchImpl?: FetchLike; force?: boolean; only?: string[]; now?: Date }) {
  const client = opts.client ?? db();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const rows = await loadUrlStatus(client);
  const todo = pickForCrawl(rows, now, opts.force, opts.only);
  // Keep about a fifth of the time for the link check.
  const pageDeadline = opts.deadline - Math.max(10_000, (opts.deadline - Date.now()) / 5);
  const results = await pool(todo, 8, pageDeadline, (u) => crawlUrl(u, fetchImpl));

  // Internal links that are not pages we already know to be fine.
  const known = new Map<string, number | null>();
  for (const r of rows) if (r.http_status !== null) known.set(normUrl(r.url), r.http_status);
  for (const r of results) known.set(normUrl(r.url), r.http_status);
  const toCheck = new Set<string>();
  for (const r of results) for (const l of r.internalLinks) if (!known.has(normUrl(l))) toCheck.add(l);
  const prevBroken = new Map(rows.map((r) => [r.url, r.broken_links ?? []]));
  const checked = await pool(orderLinkChecks([...toCheck], new Set([...prevBroken.values()].flat()), now), 8, opts.deadline, async (l) => ({
    url: l,
    status: (await crawlUrl(l, fetchImpl)).http_status,
  }));
  for (const c of checked) known.set(normUrl(c.url), c.status);

  const crawledAt = now.toISOString();
  const updates = results.map((r) => ({
    url: r.url,
    http_status: r.http_status,
    redirect_to: r.redirect_to,
    x_robots_tag: r.x_robots_tag,
    title: r.title,
    meta_description: r.meta_description,
    canonical: r.canonical,
    robots_meta: r.robots_meta,
    h1_count: r.h1_count,
    jsonld_types: r.jsonld_types,
    jsonld_errors: r.jsonld_errors,
    word_count: r.word_count,
    answer_first: r.answer_first,
    broken_links: brokenLinksFor(r.internalLinks, prevBroken.get(r.url) ?? [], known),
    crawl_error: r.crawl_error,
    crawled_at: crawledAt,
  }));
  await upsertBatches(client, 'seo_url_status', updates, 'url');

  const byStatus: Record<string, number> = {};
  for (const r of results) byStatus[String(r.http_status ?? 'error')] = (byStatus[String(r.http_status ?? 'error')] ?? 0) + 1;
  return { crawled: results.length, remaining: todo.length - results.length, linksChecked: checked.length, byStatus };
}
