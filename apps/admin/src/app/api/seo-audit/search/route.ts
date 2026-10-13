export const dynamic = 'force-dynamic';

/**
 * GET /api/seo-audit/search - search performance for the last 28 final days:
 * top pages (with the 28 days before), top queries, and the striking-distance
 * list (searches where we sit at position 5 to 20). Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { normUrl } from '@/lib/seo-audit/rules';
import { db, latestSearchDate, pageWindow, queryPageWindow, shiftDate } from '@/lib/seo-audit/store';

export async function GET(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const end = await latestSearchDate(client);
    if (!end) return NextResponse.json({ end: null, pages: [], queries: [], striking: [] });

    const [now28, prev28, qp] = await Promise.all([
      pageWindow(client, shiftDate(end, -27), end),
      pageWindow(client, shiftDate(end, -55), shiftDate(end, -28)),
      queryPageWindow(client, shiftDate(end, -27), end, 5),
    ]);
    const prev = new Map(prev28.map((p) => [normUrl(p.page), p]));
    const pages = now28
      .map((p) => ({ ...p, prev_clicks: prev.get(normUrl(p.page))?.clicks ?? 0, ctr: p.impressions ? p.clicks / p.impressions : 0 }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 300);

    const byQuery = new Map<string, { query: string; clicks: number; impressions: number; weighted: number; pages: number; top: string; topImpr: number }>();
    for (const r of qp) {
      const q = byQuery.get(r.query) ?? { query: r.query, clicks: 0, impressions: 0, weighted: 0, pages: 0, top: r.page, topImpr: 0 };
      q.clicks += r.clicks;
      q.impressions += r.impressions;
      q.weighted += r.avg_position * r.impressions;
      q.pages += 1;
      if (r.impressions > q.topImpr) {
        q.top = r.page;
        q.topImpr = r.impressions;
      }
      byQuery.set(r.query, q);
    }
    const queries = [...byQuery.values()]
      .map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.impressions ? q.weighted / q.impressions : 0, pages: q.pages, page: q.top }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 300);

    const striking = qp
      .filter((r) => r.avg_position >= 4.5 && r.avg_position <= 20 && r.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100);

    return NextResponse.json({ end, pages, queries, striking });
  } catch (err) {
    return seoError(err, 'search');
  }
}
