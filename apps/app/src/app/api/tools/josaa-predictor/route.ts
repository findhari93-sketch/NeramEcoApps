// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  predictJosaaColleges,
  logToolUsage,
  getSupabaseBrowserClient,
} from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

async function verifyUser(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await verifyIdToken(authHeader.slice(7));
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

/**
 * POST /api/tools/josaa-predictor
 * Body: { rank, seatType?, gender?, quota?, year?, roundNo? }
 * Returns: { predictions: JosaaPrediction[], counts: { safe, probable, reach } }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { rank, seatType, gender, quota, year, roundNo } = body || {};

    if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 1 || rank > 1_500_000) {
      return NextResponse.json(
        { error: 'rank must be a positive number between 1 and 1,500,000' },
        { status: 400 },
      );
    }

    const startTime = Date.now();
    const supabase = getSupabaseBrowserClient();

    const predictions = await predictJosaaColleges(
      {
        rank,
        seatType: seatType || 'OPEN',
        gender: gender || 'Gender-Neutral',
        quota: quota || null,
        year: year ?? null,
        roundNo: roundNo ?? null,
      },
      supabase,
    );

    const counts = { safe: 0, probable: 0, reach: 0 };
    for (const p of predictions) {
      if (p.chance === 'safe') counts.safe++;
      else if (p.chance === 'probable') counts.probable++;
      else if (p.chance === 'reach') counts.reach++;
    }

    const executionTime = Date.now() - startTime;

    logToolUsage(
      {
        toolName: 'josaa_predictor',
        userId: user.uid,
        inputData: { rank, seatType, gender, quota, year, roundNo },
        resultData: { total: predictions.length, ...counts },
        executionTimeMs: executionTime,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase,
    ).catch(() => {});

    return NextResponse.json({ predictions, counts, executionTime });
  } catch (err: any) {
    console.error('josaa-predictor error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal error' },
      { status: 500 },
    );
  }
}
