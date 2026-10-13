/**
 * The URL set the audit watches:
 *   sitemap  everything in our sitemaps (we want these indexed)
 *   search   pages outside the sitemaps that still get impressions
 *   import   URLs staff paste from a Search Console report export
 */
import { collectSitemapUrls } from './sitemaps';
import { normUrl } from './rules';
import { db, lastFinalDate, loadUrlStatus, pageWindow, shiftDate, upsertBatches, latestSearchDate } from './store';

export async function refreshUrlSet(opts: { client?: any; origins: string[]; now?: Date }) {
  const client = opts.client ?? db();
  const now = (opts.now ?? new Date()).toISOString();
  const { urls: sitemapUrls, errors } = await collectSitemapUrls(opts.origins);
  const existing = await loadUrlStatus(client);
  const byUrl = new Map(existing.map((r) => [r.url, r]));

  const rows = sitemapUrls.map((s) => {
    const prev = byUrl.get(s.loc);
    // Changed since Google last looked: lastmod differs from the one we inspected against.
    const changed = !!prev?.inspected_at && (s.lastmod ?? null) !== (prev.inspected_lastmod ?? null);
    return {
      url: s.loc,
      source: 'sitemap',
      sitemap: s.sitemap,
      sitemap_lastmod: s.lastmod,
      expected_index: true,
      last_seen_at: now,
      // New or changed pages go to the front of tomorrow's inspection queue.
      priority_inspect: prev ? prev.priority_inspect || changed : true,
    };
  });
  await upsertBatches(client, 'seo_url_status', rows, 'url');

  // Pages that left the sitemaps. Skipped when the sitemaps could not be read,
  // so a bad fetch never marks every page as dropped.
  let dropped = 0;
  if (sitemapUrls.length > 0 && errors.length === 0) {
    const inSitemap = new Set(sitemapUrls.map((s) => s.loc));
    const gone = existing.filter((r) => r.expected_index && !inSitemap.has(r.url)).map((r) => r.url);
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await client.from('seo_url_status').update({ expected_index: false, source: 'search' }).in('url', gone.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    dropped = gone.length;
  }

  // Pages outside the sitemaps that people still find in search.
  const end = (await latestSearchDate(client)) ?? lastFinalDate();
  const known = new Set([...existing.map((r) => normUrl(r.url)), ...sitemapUrls.map((s) => normUrl(s.loc))]);
  const fromSearch = (await pageWindow(client, shiftDate(end, -27), end)).filter((p) => p.impressions >= 20 && !known.has(normUrl(p.page)));
  await upsertBatches(
    client,
    'seo_url_status',
    fromSearch.map((p) => ({ url: p.page, source: 'search', expected_index: false, priority_inspect: true, last_seen_at: now })),
    'url',
  );

  return { sitemapUrls: sitemapUrls.length, dropped, addedFromSearch: fromSearch.length, errors };
}

/** Pull URLs out of pasted text (a Search Console CSV export or one URL per line). */
export function extractUrls(text: string, allowedOrigins: string[]): string[] {
  const allowed = new Set(allowedOrigins.map((o) => new URL(o).host));
  const found = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s",<>]+/g)) {
    try {
      const u = new URL(m[0]);
      const host = u.host.replace(/^www\./, '');
      if (allowed.has(host) || allowed.has(u.host)) found.add(u.toString());
    } catch {
      /* ignore */
    }
  }
  return [...found].slice(0, 2000);
}

/** Pasted URLs: inspected and crawled first. Sitemap rows keep their source. */
export async function importUrls(opts: { client?: any; urls: string[]; now?: Date }) {
  const client = opts.client ?? db();
  const now = (opts.now ?? new Date()).toISOString();
  const existing = new Map((await loadUrlStatus(client)).map((r) => [r.url, r]));
  const fresh = opts.urls.filter((u) => !existing.has(u));
  const known = opts.urls.filter((u) => existing.has(u));
  await upsertBatches(
    client,
    'seo_url_status',
    fresh.map((url) => ({ url, source: 'import', expected_index: false, priority_inspect: true, last_seen_at: now })),
    'url',
  );
  for (let i = 0; i < known.length; i += 200) {
    // crawled_at null puts them at the front of the crawl queue too.
    const { error } = await client.from('seo_url_status').update({ priority_inspect: true, crawled_at: null }).in('url', known.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return { added: fresh.length, requeued: known.length };
}
