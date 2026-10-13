export const dynamic = 'force-dynamic';

/**
 * GET /api/seo-audit/urls - every URL SEO Health watches, with Google's
 * inspection verdict and our last crawl, for the URLs table. Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { db, selectAll } from '@/lib/seo-audit/store';

export async function GET(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const urls = await selectAll<any>((a, b) =>
      client
        .from('seo_url_status')
        .select('url, source, sitemap, expected_index, verdict, coverage_state, google_canonical, inspected_at, http_status, redirect_to, title, robots_meta, x_robots_tag, word_count, crawled_at, inspect_error, crawl_error')
        .order('url')
        .range(a, b),
    );
    return NextResponse.json({ urls });
  } catch (err) {
    return seoError(err, 'urls');
  }
}
