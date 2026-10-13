import { BASE_URL } from '@/lib/seo/constants';
import { buildImageSitemap } from '@/lib/seo/sitemaps';
import { getCollegeSitemapRows } from '@/lib/college-hub/queries';
import { collegeLastModified } from '@/lib/college-hub/sitemap-lastmod';

/**
 * Image sitemap: each college page with its cover photo (found by the Admin
 * photo cron or set by staff). Colleges without a photo are left out, so this
 * is empty until photos exist. Same cached query as the core sitemap.
 */
export const revalidate = 86400;

export async function GET() {
  let pages: Array<{ loc: string; images: string[]; lastmod: string }> = [];
  try {
    const rows = await getCollegeSitemapRows();
    pages = rows
      .filter((r) => !!r.hero_image_url)
      .map((r) => ({
        loc: `${BASE_URL}/colleges/${r.state_slug ?? 'india'}/${r.slug}`,
        images: [r.hero_image_url as string],
        lastmod: collegeLastModified(r).toISOString(),
      }));
  } catch (err) {
    console.error('college-images sitemap failed:', err);
  }
  return new Response(buildImageSitemap(pages), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
