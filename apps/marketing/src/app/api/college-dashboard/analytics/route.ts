export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

/**
 * GET /api/college-dashboard/analytics
 * Page views, delivered enquiries by status, reviews, and what students typed
 * into Google before they reached the college page (Search Console, 90 days).
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;
    const cid = authUser.college_id;

    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: college } = await db.from('colleges').select('slug').eq('id', cid).single();

    const [views7, views30, views90, leadRows, reviewsCount, gscRows] = await Promise.all([
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', cid).gte('viewed_at', ago(7)),
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', cid).gte('viewed_at', ago(30)),
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', cid).gte('viewed_at', ago(90)),
      db.from('college_leads').select('status, created_at').eq('college_id', cid).eq('admin_review_status', 'approved').limit(2000),
      db.from('college_reviews').select('id', { count: 'exact', head: true }).eq('college_id', cid).eq('status', 'approved'),
      college?.slug
        ? db
            .from('gsc_search_daily')
            .select('query, impressions, clicks')
            .ilike('page', `%/${college.slug}`)
            .gte('date', ago(90).slice(0, 10))
            .limit(5000)
        : Promise.resolve({ data: [] }),
    ]);

    const leads = (leadRows.data ?? []) as Array<{ status: string; created_at: string }>;
    const byStatus: Record<string, number> = {};
    for (const l of leads) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;

    const queries = new Map<string, { impressions: number; clicks: number }>();
    for (const r of (gscRows.data ?? []) as Array<{ query: string | null; impressions: number; clicks: number }>) {
      const q = r.query?.trim();
      if (!q) continue;
      const cur = queries.get(q) ?? { impressions: 0, clicks: 0 };
      cur.impressions += r.impressions ?? 0;
      cur.clicks += r.clicks ?? 0;
      queries.set(q, cur);
    }
    const topQueries = [...queries.entries()]
      .map(([query, v]) => ({ query, ...v }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    return NextResponse.json({
      page_views_7d: views7.count ?? 0,
      page_views_30d: views30.count ?? 0,
      page_views_90d: views90.count ?? 0,
      lead_count: leads.length,
      leads_30d: leads.filter((l) => l.created_at >= ago(30)).length,
      leads_by_status: byStatus,
      review_count: reviewsCount.count ?? 0,
      search_impressions_90d: [...queries.values()].reduce((n, v) => n + v.impressions, 0),
      top_queries: topQueries,
    });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}
