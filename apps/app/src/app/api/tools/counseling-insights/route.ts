// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCounselingSystems,
  getAvailableYearsWithSource,
  getRankListYearSummary,
  getAllotmentYearSummary,
  getRankListCommunityStats,
  getAllotmentCommunityStats,
  getAllotmentCollegeStats,
  getSupabaseBrowserClient,
} from '@neram/database';

/**
 * GET /api/tools/counseling-insights
 *
 * Query params:
 *   - systemId: counseling system UUID (required for year/stats data)
 *   - year: specific year to get stats for
 *
 * Without systemId: returns list of counseling systems
 * With systemId only: returns available years
 * With systemId + year: returns full insights (funnel, community, colleges)
 */
// Same answer for every student and it changes only when new lists are
// imported, so let the CDN serve it (as the rank predictor's GET does).
const SHARED_CACHE = { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const systemId = searchParams.get('systemId');
    const yearParam = searchParams.get('year');

    const supabase = getSupabaseBrowserClient();

    // No systemId → return systems list
    if (!systemId) {
      const systems = await getCounselingSystems(supabase);
      return NextResponse.json({ systems }, SHARED_CACHE);
    }

    // Get available years
    const yearsWithSource = await getAvailableYearsWithSource(systemId, supabase);

    // No year specified → return years only
    if (!yearParam) {
      return NextResponse.json({ yearsWithSource }, SHARED_CACHE);
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    // Fetch all stats in parallel
    const [rankYearSummary, allotmentYearSummary, rankCommunity, allotmentCommunity, collegeStats] =
      await Promise.all([
        getRankListYearSummary(systemId, supabase),
        getAllotmentYearSummary(systemId, supabase),
        getRankListCommunityStats(systemId, year, supabase).catch(() => []),
        getAllotmentCommunityStats(systemId, year, supabase).catch(() => []),
        getAllotmentCollegeStats(systemId, year, supabase).catch(() => []),
      ]);

    // Build funnel
    const rankYear = rankYearSummary.find((r) => r.year === year);
    const allotmentYear = allotmentYearSummary.find((r) => r.year === year);
    const totalApplicants = rankYear?.totalEntries || 0;
    const totalAllotted = allotmentYear?.totalEntries || 0;

    return NextResponse.json({
      yearsWithSource,
      year,
      funnel: {
        totalApplicants,
        totalAllotted,
        conversionRate: totalApplicants > 0 ? Math.round((totalAllotted / totalApplicants) * 1000) / 10 : null,
        hasRankData: !!rankYear,
        hasAllotmentData: !!allotmentYear,
      },
      communityBreakdown: {
        rankList: rankCommunity,
        allotment: allotmentCommunity,
      },
      colleges: collegeStats,
    }, SHARED_CACHE);
  } catch (error: any) {
    console.error('Counseling insights error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
