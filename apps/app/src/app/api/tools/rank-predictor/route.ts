// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCounselingSystems,
  getCounselingSystemByCode,
  predictRankFromScore,
  getRankListYears,
  getAvailableYearsWithSource,
  getRankListCommunityStats,
  getAllotmentCommunityStats,
  getAllotmentYearSummary,
  logToolUsage,
  getSupabaseBrowserClient,
} from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

async function verifyUser(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decodedToken = await verifyIdToken(authHeader.slice(7));
    return { uid: decodedToken.uid };
  } catch {
    return null;
  }
}

/**
 * GET /api/tools/rank-predictor
 * Returns available counseling systems and years with rank data.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'years') {
      const systemId = searchParams.get('systemId');
      if (!systemId) {
        return NextResponse.json({ error: 'systemId required' }, { status: 400 });
      }
      const supabase = getSupabaseBrowserClient();
      const yearsWithSource = await getAvailableYearsWithSource(systemId, supabase);
      const years = yearsWithSource.map((y) => y.year);

      // Also fetch community stats for the target year
      let communityStats = null;
      const yearParam = searchParams.get('year');
      const targetYear = yearParam ? parseInt(yearParam, 10) : (years.length > 0 ? years[0] : null);
      if (targetYear) {
        // Use rank list stats if available, otherwise allotment stats
        const yearInfo = yearsWithSource.find((y) => y.year === targetYear);
        if (yearInfo?.source === 'allotment') {
          communityStats = await getAllotmentCommunityStats(systemId, targetYear, supabase);
        } else {
          communityStats = await getRankListCommunityStats(systemId, targetYear, supabase);
        }
      }

      // Get allotment count for the target year (to show "X got seats")
      let allotmentCount = 0;
      if (targetYear) {
        const allotmentSummary = await getAllotmentYearSummary(systemId, supabase);
        const allotmentYear = allotmentSummary.find((s) => s.year === targetYear);
        if (allotmentYear) allotmentCount = allotmentYear.totalEntries;
      }

      return NextResponse.json({ years, yearsWithSource, communityStats, statsYear: targetYear, allotmentCount }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    // Default: return systems
    const supabase = getSupabaseBrowserClient();
    const systems = await getCounselingSystems(supabase);
    return NextResponse.json({ systems }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error: any) {
    console.error('Rank predictor GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/tools/rank-predictor
 * Predict rank from composite score.
 * Body: { systemCode, compositeScore, category?, year? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }

    const startTime = Date.now();
    const body = await request.json();
    const { systemCode, compositeScore, category, year } = body;

    if (!systemCode || typeof compositeScore !== 'number') {
      return NextResponse.json(
        { error: 'systemCode and compositeScore (number) are required' },
        { status: 400 }
      );
    }

    if (compositeScore < 0 || compositeScore > 400) {
      return NextResponse.json(
        { error: 'compositeScore must be between 0 and 400' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseBrowserClient();

    // Resolve system
    const system = await getCounselingSystemByCode(systemCode, supabase);
    if (!system) {
      return NextResponse.json(
        { error: `Counseling system "${systemCode}" not found` },
        { status: 404 }
      );
    }

    // Get available years
    const availableYears = await getRankListYears(system.id, supabase);
    const targetYear = year || (availableYears.length > 0 ? availableYears[0] : new Date().getFullYear());

    // Predict rank
    const prediction = await predictRankFromScore(
      system.id,
      targetYear,
      compositeScore,
      category || undefined,
      supabase
    );

    const executionTime = Date.now() - startTime;

    // Transform flat prediction to nested format expected by the page
    const transformedPrediction = prediction
      ? {
          predictedRank:
            prediction.predictedRankMin != null
              ? { min: prediction.predictedRankMin, max: prediction.predictedRankMax }
              : null,
          categoryRank:
            prediction.categoryRankMin != null && prediction.categoryRankMax != null
              ? { min: prediction.categoryRankMin, max: prediction.categoryRankMax }
              : null,
          percentile: prediction.percentile,
          totalCandidates: prediction.totalCandidates,
          matchedEntries: prediction.matchedEntries || 0,
          confidenceBand: '±10%',
          dataSource: prediction.dataSource,
          dataSourceLabel: prediction.dataSourceLabel,
        }
      : null;

    // Log usage (non-blocking)
    logToolUsage(
      {
        toolName: 'rank_predictor',
        userId: user.uid,
        inputData: { systemCode, compositeScore, category, year: targetYear },
        resultData: {
          predictedRank: transformedPrediction?.predictedRank,
          percentile: transformedPrediction?.percentile,
        },
        executionTimeMs: executionTime,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase
    ).catch((err) => console.error('Failed to log tool usage:', err));

    return NextResponse.json({
      prediction: transformedPrediction,
      similarStudents: prediction?.similarStudents || [],
      system: { id: system.id, code: system.code, name: system.name },
      year: targetYear,
      availableYears,
      executionTime,
    });
  } catch (error: any) {
    console.error('Rank predictor POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Prediction failed' },
      { status: 500 }
    );
  }
}
