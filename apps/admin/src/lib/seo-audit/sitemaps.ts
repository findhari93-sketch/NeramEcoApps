/**
 * Reads our own sitemaps: each origin's /sitemap.xml index and every child
 * sitemap it lists. The URL set is what we tell Google to index, so it is what
 * the audit expects to see indexed.
 *
 * parseSitemap is a copy of apps/marketing/src/lib/seo/sitemaps.ts (apps do not
 * import from each other); keep the two in step.
 */

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

export interface ParsedSitemap {
  kind: 'index' | 'urlset';
  entries: SitemapEntry[];
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Reads a sitemap or a sitemap index into its <loc>/<lastmod> pairs. Image and video <loc>s are ignored. */
export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/.test(xml) ? 'index' : 'urlset';
  const tag = kind === 'index' ? 'sitemap' : 'url';
  const blocks = xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? [];
  const entries = blocks
    .map((b) => ({
      // <image:loc> and <video:...> tags do not match <loc>.
      loc: decode(b.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? ''),
      lastmod: b.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim() ?? null,
    }))
    .filter((e) => e.loc);
  return { kind, entries };
}

export interface SitemapUrl {
  loc: string;
  lastmod: string | null;
  sitemap: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const UA = 'NeramSEOAudit/1.0 (+https://neramclasses.com)';

/** Every URL in every origin's sitemaps, deduplicated (first sitemap wins, latest lastmod kept). */
export async function collectSitemapUrls(origins: string[], fetchImpl: FetchLike = fetch): Promise<{ urls: SitemapUrl[]; errors: string[] }> {
  const byLoc = new Map<string, SitemapUrl>();
  const errors: string[] = [];
  const seen = new Set<string>();

  const visit = async (sitemapUrl: string, depth: number): Promise<void> => {
    if (seen.has(sitemapUrl) || depth > 2) return;
    seen.add(sitemapUrl);
    let xml: string;
    try {
      const res = await fetchImpl(sitemapUrl, { cache: 'no-store', headers: { 'User-Agent': UA } });
      if (!res.ok) {
        errors.push(`${sitemapUrl} returned ${res.status}`);
        return;
      }
      xml = await res.text();
    } catch (e) {
      errors.push(`${sitemapUrl}: ${e instanceof Error ? e.message : 'fetch failed'}`);
      return;
    }
    const parsed = parseSitemap(xml);
    if (parsed.kind === 'index') {
      for (const child of parsed.entries) await visit(child.loc, depth + 1);
      return;
    }
    const path = new URL(sitemapUrl).pathname;
    for (const e of parsed.entries) {
      const prev = byLoc.get(e.loc);
      if (!prev) byLoc.set(e.loc, { loc: e.loc, lastmod: e.lastmod, sitemap: path });
      else if (e.lastmod && (!prev.lastmod || e.lastmod > prev.lastmod)) prev.lastmod = e.lastmod;
    }
  };

  for (const origin of origins) await visit(`${origin}/sitemap.xml`, 0);
  return { urls: [...byLoc.values()], errors };
}
