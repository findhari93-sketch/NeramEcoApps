/**
 * Keeps Google reading our sitemaps. Google retired the sitemap "ping" in
 * 2023, so the Search Console API is the only way to say "read this again".
 *
 * Each day, per origin (neramclasses.com, app.neramclasses.com), a sitemap is
 * resubmitted when:
 *   - Search Console does not list it at all;
 *   - its set of URLs changed since yesterday (new or removed pages);
 *   - Google has not downloaded it for a week (the app sitemap sat unread from
 *     March to October 2026 while 264 new pages were added).
 * A sitemap submitted in the last day is never resubmitted.
 */
import { createHash } from 'crypto';
import type { GscClient, GscSitemap } from './gsc/client';
import { collectSitemapUrls } from './sitemaps';

export const STALE_DOWNLOAD_DAYS = 7;
const DAY = 86_400_000;

export interface SitemapState {
  /** The sitemap index URL we submit, e.g. https://app.neramclasses.com/sitemap.xml */
  url: string;
  /** Hash of the sorted page URLs it lists. */
  hash: string;
  pages: number;
}

export interface SubmitDecision {
  url: string;
  reason: string;
}

export function hashUrls(urls: string[]): string {
  return createHash('sha1').update([...urls].sort().join('\n')).digest('hex').slice(0, 16);
}

/** Pure: which sitemaps to submit today, and why. */
export function sitemapsToSubmit(current: SitemapState[], known: GscSitemap[], prevHashes: Record<string, string>, now: Date): SubmitDecision[] {
  const age = (iso?: string) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : Infinity);
  const out: SubmitDecision[] = [];
  for (const c of current) {
    if (c.pages === 0) continue; // an unreadable sitemap is a crawl problem, not a reason to submit
    const k = known.find((s) => s.path === c.url);
    if (k && age(k.lastSubmitted) < 1) continue;
    if (!k) out.push({ url: c.url, reason: 'not submitted in Search Console' });
    else if (prevHashes[c.url] && prevHashes[c.url] !== c.hash) out.push({ url: c.url, reason: 'pages added or removed' });
    else if (age(k.lastDownloaded) > STALE_DOWNLOAD_DAYS) {
      const days = Number.isFinite(age(k.lastDownloaded)) ? `${Math.floor(age(k.lastDownloaded))} days` : 'ever';
      out.push({ url: c.url, reason: `not read by Google for ${days}` });
    }
  }
  return out;
}

/** Reads each origin's sitemap, decides and submits. Returns what it did and today's hashes. */
export async function runSitemapSubmit(opts: { gsc: GscClient; origins: string[]; prevHashes: Record<string, string>; now?: Date }) {
  const now = opts.now ?? new Date();
  const current: SitemapState[] = [];
  const errors: string[] = [];
  for (const origin of opts.origins) {
    const { urls, errors: e } = await collectSitemapUrls([origin]);
    errors.push(...e);
    current.push({ url: `${origin}/sitemap.xml`, hash: hashUrls(urls.map((u) => u.loc)), pages: urls.length });
  }
  const known = await opts.gsc.listSitemaps();
  const decisions = sitemapsToSubmit(current, known, opts.prevHashes, now);
  const submitted: SubmitDecision[] = [];
  const failed = new Set<string>();
  for (const d of decisions) {
    try {
      await opts.gsc.submitSitemap(d.url);
      submitted.push(d);
    } catch (e) {
      failed.add(d.url);
      errors.push(`${d.url}: ${e instanceof Error ? e.message : 'submit failed'}`);
    }
  }
  // A failed submit keeps yesterday's hash, so tomorrow still sees the change.
  const hashes: Record<string, string> = {};
  for (const c of current) {
    if (c.pages === 0) continue;
    const keep = failed.has(c.url) ? opts.prevHashes[c.url] : c.hash;
    if (keep) hashes[c.url] = keep;
  }
  return {
    submitted,
    sitemaps: current.map((c) => ({ url: c.url, pages: c.pages, lastDownloaded: known.find((k) => k.path === c.url)?.lastDownloaded ?? null })),
    hashes,
    errorsList: errors,
  };
}
