export const dynamic = 'force-dynamic';

/**
 * GET /api/seo-audit/url?u=<url> - everything we know about one URL: Google's
 * inspection result, our crawl, its open findings and the searches it showed
 * for in the last 28 days. Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { normUrl } from '@/lib/seo-audit/rules';
import { db, lastFinalDate, latestSearchDate, selectAll, shiftDate } from '@/lib/seo-audit/store';

export async function GET(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const u = new URL(request.url).searchParams.get('u');
    if (!u) return NextResponse.json({ error: 'Send the URL as ?u=' }, { status: 400 });
    const client = db();
    const variants = [...new Set([u, normUrl(u), `${normUrl(u)}/`])];

    const { data: rows } = await client.from('seo_url_status').select('*').in('url', variants).limit(1);
    const { data: findings } = await client.from('seo_findings').select('id, rule_id, severity, title, status, detail, first_seen').in('url', variants).neq('status', 'fixed').limit(50);

    const end = (await latestSearchDate(client)) ?? lastFinalDate();
    const raw = await selectAll<any>((a, b) =>
      client
        .from('gsc_search_daily')
        .select('query, clicks, impressions, position')
        .in('page', variants)
        .neq('query', '')
        .gte('date', shiftDate(end, -27))
        .lte('date', end)
        .order('date')
        .range(a, b),
    );
    const byQuery = new Map<string, { query: string; clicks: number; impressions: number; weighted: number }>();
    for (const r of raw) {
      const q = byQuery.get(r.query) ?? { query: r.query, clicks: 0, impressions: 0, weighted: 0 };
      q.clicks += r.clicks;
      q.impressions += r.impressions;
      q.weighted += r.position * r.impressions;
      byQuery.set(r.query, q);
    }
    const queries = [...byQuery.values()]
      .map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.impressions ? q.weighted / q.impressions : null }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50);

    return NextResponse.json({ url: rows?.[0] ?? null, findings: findings ?? [], queries });
  } catch (err) {
    return seoError(err, 'url');
  }
}
