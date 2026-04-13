export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ago90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [views7, views30, views90, leadsCount, reviewsCount, savesCount]: Array<{ count: number | null }> = await Promise.all([
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).gte('viewed_at', ago7d),
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).gte('viewed_at', ago30d),
      db.from('college_page_views').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).gte('viewed_at', ago90d),
      db.from('college_leads').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id),
      db.from('college_reviews').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).eq('status', 'approved'),
      db.from('college_leads').select('id', { count: 'exact', head: true }).eq('college_id', authUser.college_id).eq('source', 'save'),
    ]);

    return NextResponse.json({
      page_views_7d: views7.count ?? 0,
      page_views_30d: views30.count ?? 0,
      page_views_90d: views90.count ?? 0,
      lead_count: leadsCount.count ?? 0,
      review_count: reviewsCount.count ?? 0,
      saves_count: savesCount.count ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
