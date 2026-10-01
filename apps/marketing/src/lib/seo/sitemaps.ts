/**
 * Sitemap index and the parsing the IndexNow cron uses to read it. Pure, so
 * the index format and the "what changed recently" selection are unit-tested.
 */

export const CHILD_SITEMAPS = ['/sitemaps/core/sitemap.xml', '/sitemaps/coaching-locations/sitemap.xml'];

export function buildSitemapIndex(baseUrl: string, lastmod: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CHILD_SITEMAPS.map((p) => `  <sitemap><loc>${baseUrl}${p}</loc><lastmod>${lastmod}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`;
}

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

/** Reads a sitemap or a sitemap index into its <loc>/<lastmod> pairs. */
export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/.test(xml) ? 'index' : 'urlset';
  const tag = kind === 'index' ? 'sitemap' : 'url';
  const blocks = xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? [];
  const entries = blocks
    .map((b) => ({
      loc: decode(b.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? ''),
      lastmod: b.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim() ?? null,
    }))
    .filter((e) => e.loc);
  return { kind, entries };
}

/**
 * URLs whose lastmod falls within the last `sinceDays` days. Entries without a
 * lastmod are included, so nothing is silently never submitted.
 */
export function selectRecent(entries: SitemapEntry[], sinceDays: number, now: Date = new Date()): string[] {
  const cutoff = now.getTime() - sinceDays * 86_400_000;
  return entries
    .filter((e) => {
      if (!e.lastmod) return true;
      const t = Date.parse(e.lastmod);
      return Number.isNaN(t) || t >= cutoff;
    })
    .map((e) => e.loc);
}
