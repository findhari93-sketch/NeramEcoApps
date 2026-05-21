// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  predictJosaaCollegesV2,
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
 * Body: {
 *   rank: number,                                    // required
 *   rankType?: 'CRL' | 'CATEGORY',                   // default 'CRL'
 *   category?: 'OPEN'|'OBC-NCL'|'SC'|'ST'|'EWS',     // ignored when rankType='CRL'
 *   pwd?: boolean,
 *   gender?: string,
 *   homeState?: string | null,                       // null = AI-only mode
 *   year?: number | number[] | null,                 // single year OR array for compare mode
 *   roundNo?: number | null
 * }
 * Returns:
 *   single-year:    { predictions, counts, executionTime }
 *   compare mode:   { byYear: { [year]: { predictions, counts } }, executionTime }
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
    const {
      rank,
      rankType,
      category,
      pwd,
      gender,
      homeState,
      year,
      roundNo,
    } = body || {};

    if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 1 || rank > 1_500_000) {
      return NextResponse.json(
        { error: 'rank must be a positive number between 1 and 1,500,000' },
        { status: 400 },
      );
    }

    const startTime = Date.now();
    const supabase = getSupabaseBrowserClient();

    const baseParams = {
      rank,
      rankType: (rankType === 'CATEGORY' ? 'CATEGORY' : 'CRL') as 'CRL' | 'CATEGORY',
      category: category || 'OPEN',
      pwd: !!pwd,
      gender: gender || 'Gender-Neutral',
      homeState: homeState || null,
      roundNo: roundNo ?? null,
    };

    // Compare mode: client sends `year` as an array of numbers.
    if (Array.isArray(year) && year.length > 0) {
      const byYear: Record<number, { predictions: any[]; counts: { safe: number; probable: number; reach: number } }> = {};
      await Promise.all(
        year.map(async (y: number) => {
          const predictions = await predictJosaaCollegesV2(
            { ...baseParams, year: y },
            supabase,
          );
          const counts = { safe: 0, probable: 0, reach: 0 };
          for (const p of predictions) {
            if (p.chance === 'safe') counts.safe++;
            else if (p.chance === 'probable') counts.probable++;
            else if (p.chance === 'reach') counts.reach++;
          }
          byYear[y] = { predictions, counts };
        }),
      );

      const executionTime = Date.now() - startTime;
      logToolUsage(
        {
          toolName: 'josaa_predictor',
          userId: user.uid,
          inputData: { rank, rankType, category, pwd, gender, homeState, year, roundNo, compare: true },
          resultData: { years: year, totals: Object.fromEntries(Object.entries(byYear).map(([y, v]) => [y, v.predictions.length])) },
          executionTimeMs: executionTime,
          userAgent: request.headers.get('user-agent') || undefined,
        },
        supabase,
      ).catch(() => {});

      return NextResponse.json({ byYear, executionTime });
    }

    // Single-year path
    const predictions = await predictJosaaCollegesV2(
      { ...baseParams, year: year ?? null },
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
        inputData: { rank, rankType, category, pwd, gender, homeState, year, roundNo },
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
