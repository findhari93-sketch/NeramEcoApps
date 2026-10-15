/**
 * Asks Google, URL by URL, whether a page is indexed and why not (URL
 * Inspection API, 2,000 a day per property). The daily budget goes, in order, to:
 *   1. new, changed or pasted URLs (priority_inspect)
 *   2. URLs with an open indexing finding, to see if the fix took
 *   3. sitemap URLs never inspected
 *   4. the rest, stalest first, skipping any inspected in the last 3 days
 */
import { INSPECT_DAILY_BUDGET, INSPECT_HARD_DAILY_CAP } from './config';
import type { GscClient, IndexStatusResult } from './gsc/client';
import { GscApiError } from './gsc/client';
import { pool } from './crawl';
import { normUrl } from './rules';
import { db, loadUrlStatus, upsertBatches } from './store';
import type { UrlStatus } from './types';

const FRESH_MS = 3 * 86_400_000;

export function pickForInspection(rows: UrlStatus[], openIndexingUrls: Set<string>, budget: number, now: Date): string[] {
  const t = now.getTime();
  const stale = (r: UrlStatus) => !r.inspected_at || t - Date.parse(r.inspected_at) > FRESH_MS;
  const rank = (r: UrlStatus) => {
    if (r.priority_inspect) return 0;
    if (openIndexingUrls.has(normUrl(r.url)) && (!r.inspected_at || t - Date.parse(r.inspected_at) > 86_400_000)) return 1;
    if (!r.inspected_at && r.expected_index) return 2;
    if (stale(r)) return 3;
    return 9;
  };
  return rows
    .map((r) => ({ r, k: rank(r) }))
    .filter((x) => x.k < 9)
    .sort((a, b) => a.k - b.k || (a.r.inspected_at ? Date.parse(a.r.inspected_at) : 0) - (b.r.inspected_at ? Date.parse(b.r.inspected_at) : 0))
    .slice(0, budget)
    .map((x) => x.r.url);
}

export function toInspectionRow(url: string, r: IndexStatusResult, lastmod: string | null, at: string) {
  return {
    url,
    verdict: r.verdict ?? null,
    coverage_state: r.coverageState ?? null,
    indexing_state: r.indexingState ?? null,
    robots_txt_state: r.robotsTxtState ?? null,
    page_fetch_state: r.pageFetchState ?? null,
    google_canonical: r.googleCanonical ?? null,
    user_canonical: r.userCanonical ?? null,
    last_crawl_time: r.lastCrawlTime ?? null,
    inspected_at: at,
    inspected_lastmod: lastmod,
    inspect_error: null as string | null,
    priority_inspect: false,
  };
}

export async function runInspect(opts: { gsc: GscClient; client?: any; deadline: number; now?: Date }) {
  const client = opts.client ?? db();
  const now = opts.now ?? new Date();

  // Today's spend so far, so manual runs cannot push us over Google's daily limit.
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: today } = await client.from('seo_audit_runs').select('counts').eq('kind', 'inspect').gte('started_at', dayStart.toISOString()).limit(100);
  const spent = (today ?? []).reduce((s: number, r: any) => s + (Number(r.counts?.inspected) || 0), 0);
  const budget = Math.max(0, Math.min(INSPECT_DAILY_BUDGET, INSPECT_HARD_DAILY_CAP - spent));
  if (budget === 0) return { inspected: 0, errors: 0, skipped: 'daily budget used' };

  const rows = await loadUrlStatus(client);
  const { data: open } = await client.from('seo_findings').select('url').in('status', ['open', 'waiting']).eq('category', 'indexing').limit(5000);
  const openUrls = new Set<string>((open ?? []).map((f: any) => normUrl(f.url || '')));
  const lastmods = new Map(rows.map((r) => [r.url, r.sitemap_lastmod]));
  const todo = pickForInspection(rows, openUrls, budget, now);

  let quotaHit = false;
  const at = now.toISOString();
  const results = await pool(todo, 10, opts.deadline, async (url) => {
    if (quotaHit) return null;
    try {
      return toInspectionRow(url, await opts.gsc.inspectUrl(url), lastmods.get(url) ?? null, at);
    } catch (e) {
      if (e instanceof GscApiError && (e.status === 429 || e.status === 403)) quotaHit = true;
      return { ...toInspectionRow(url, {}, lastmods.get(url) ?? null, at), inspected_at: null, priority_inspect: true, inspect_error: e instanceof Error ? e.message.slice(0, 500) : 'failed' };
    }
  });

  const done = results.filter((r): r is NonNullable<typeof r> => !!r);
  // Failed rows keep their last good result: only write the error fields for them.
  const ok = done.filter((r) => !r.inspect_error);
  const failed = done.filter((r) => r.inspect_error);
  await upsertBatches(client, 'seo_url_status', ok, 'url');
  for (const f of failed.slice(0, 50)) await client.from('seo_url_status').update({ inspect_error: f.inspect_error }).eq('url', f.url);

  return { inspected: ok.length, errors: failed.length, queued: todo.length, quotaHit, firstError: failed[0]?.inspect_error ?? null };
}
