// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCounselingSystemByCode,
  predictRankFromScore,
  predictCollegesFromRank,
  predictCollegesFromAllotment,
  predictCollegesWithSeatAwareness,
  getRequiredScoreForCollege,
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
 * POST /api/tools/college-predictor/counseling
 * Enhanced college prediction using counseling system data.
 * Body: { systemCode, compositeScore, category, year }
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
    const { systemCode, compositeScore, category, year, mode, seatAware } = body;

    if (!systemCode) {
      return NextResponse.json(
        { error: 'systemCode is required' },
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

    const targetYear = year || 2025;

    // Forward prediction: score → rank → colleges
    if (mode !== 'reverse') {
      if (typeof compositeScore !== 'number' || compositeScore < 0 || compositeScore > 400) {
        return NextResponse.json(
          { error: 'compositeScore must be between 0 and 400' },
          { status: 400 }
        );
      }

      // Step 1: Predict rank from score
      const rankPrediction = await predictRankFromScore(
        system.id,
        targetYear,
        compositeScore,
        category || undefined,
        supabase
      );

      // Step 2: If we have a predicted rank, get colleges
      const predictedRank = rankPrediction?.predictedRankMin || 0;
      const effectiveRank = predictedRank || Math.round((1 - compositeScore / 400) * 1500);

      // Use seat-aware prediction by default
      const useSeatAware = seatAware !== false;

      let seatAwarePredictions = null;
      let predictions: any[] = [];
      let allotmentPredictions: any[] = [];

      if (useSeatAware) {
        try {
          seatAwarePredictions = await predictCollegesWithSeatAwareness(
            system.id,
            targetYear,
            effectiveRank,
            compositeScore,
            category || undefined,
            supabase
          );
        } catch {
          // Fall back to legacy if seat-aware fails
        }
      }

      // Fall back to legacy predictions if seat-aware not used or failed
      if (!seatAwarePredictions) {
        predictions = await predictCollegesFromRank(
          system.id,
          targetYear,
          effectiveRank,
          category || 'OC',
          {},
          supabase
        );

        if (predictedRank > 0) {
          try {
            allotmentPredictions = await predictCollegesFromAllotment(
              system.id,
              targetYear,
              predictedRank,
              category || undefined,
              supabase
            );
          } catch {
            // Allotment data may not exist for this year
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // Log usage
      logToolUsage(
        {
          toolName: 'college_predictor_counseling',
          userId: user.uid,
          inputData: { systemCode, compositeScore, category, year: targetYear, mode: 'forward', seatAware: useSeatAware },
          resultData: {
            count: seatAwarePredictions
              ? seatAwarePredictions.generalPredictions.length + seatAwarePredictions.communityPredictions.length
              : predictions.length,
            predictedRank: effectiveRank,
          },
          executionTimeMs: executionTime,
          userAgent: request.headers.get('user-agent') || undefined,
        },
        supabase
      ).catch(() => {});

      return NextResponse.json({
        // Seat-aware response (new)
        generalPredictions: seatAwarePredictions?.generalPredictions || null,
        communityPredictions: seatAwarePredictions?.communityPredictions || null,
        seatDataAvailable: seatAwarePredictions?.seatDataAvailable || false,
        totalColleges: seatAwarePredictions?.totalColleges || 0,
        // Legacy response (backward compatible)
        predictions: seatAwarePredictions ? [] : predictions,
        allotmentPredictions: seatAwarePredictions ? [] : allotmentPredictions,
        // Common
        rankPrediction,
        system: { id: system.id, code: system.code, name: system.name },
        year: targetYear,
        executionTime,
      });
    }

    // Reverse prediction: college → required score
    const { collegeIds } = body;
    if (!Array.isArray(collegeIds) || collegeIds.length === 0) {
      return NextResponse.json(
        { error: 'collegeIds array is required for reverse mode' },
        { status: 400 }
      );
    }

    const reverseResults = await Promise.all(
      collegeIds.slice(0, 5).map(async (collegeId: string) => {
        const result = await getRequiredScoreForCollege(
          collegeId,
          system.id,
          targetYear,
          category || 'OC',
          supabase
        );
        return { collegeId, ...result };
      })
    );

    const executionTime = Date.now() - startTime;

    logToolUsage(
      {
        toolName: 'college_predictor_counseling',
        userId: user.uid,
        inputData: { systemCode, collegeIds, category, year: targetYear, mode: 'reverse' },
        resultData: { count: reverseResults.length },
        executionTimeMs: executionTime,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase
    ).catch(() => {});

    return NextResponse.json({
      reverseResults,
      system: { id: system.id, code: system.code, name: system.name },
      year: targetYear,
      executionTime,
    });
  } catch (error: any) {
    console.error('Counseling college predictor error:', error);
    return NextResponse.json(
      { error: error.message || 'Prediction failed' },
      { status: 500 }
    );
  }
}
