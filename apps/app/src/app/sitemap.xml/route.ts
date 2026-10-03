import { APP_URL } from '@/lib/seo/constants';
import { buildSitemapIndex } from '@/lib/seo/sitemaps';

/**
 * Sitemap index. Next 14's generateSitemaps does not emit an index, so this
 * route lists the child sitemaps itself (lib/seo/sitemaps.ts). robots.txt,
 * Search Console, Bing and the IndexNow cron all start from /sitemap.xml.
 */
export const revalidate = 86400;

export function GET() {
  return new Response(buildSitemapIndex(APP_URL, new Date().toISOString()), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
