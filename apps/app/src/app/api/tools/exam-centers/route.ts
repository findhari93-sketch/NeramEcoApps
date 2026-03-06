// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseBrowserClient,
  listNataExamCenters,
  getNataExamCenterStates,
  getNataExamCenterCities,
  findNearestNataExamCenters,
  logToolUsage,
} from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';

// Helper to verify user from Authorization header
async function verifyUser(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const idToken = authHeader.slice(7);
    const decodedToken = await verifyIdToken(idToken);
    return { uid: decodedToken.uid };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// GET /api/tools/exam-centers - List centers or get states/cities (PUBLIC)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const supabase = getSupabaseBrowserClient();

    if (action === 'states') {
      const states = await getNataExamCenterStates(undefined, supabase);
      return NextResponse.json({ states });
    }

    if (action === 'cities') {
      const state = searchParams.get('state') || undefined;
      const cities = await getNataExamCenterCities(state, undefined, supabase);
      return NextResponse.json({ cities });
    }

    // Default: list all centers with optional filters (public preview)
    const state = searchParams.get('state') || undefined;
    const city = searchParams.get('city') || undefined;
    const search = searchParams.get('search') || undefined;
    const confidence = searchParams.get('confidence') as 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
    const tcsIonOnly = searchParams.get('tcs_ion') === 'true' || undefined;
    const barchOnly = searchParams.get('barch') === 'true' || undefined;
    const newOnly = searchParams.get('new_only') === 'true' || undefined;
    const tier = searchParams.get('tier') || undefined;

    const { centers, count } = await listNataExamCenters(
      { state, city, search, confidence, tcsIonOnly, barchOnly, newOnly, tier },
      supabase
    );

    return NextResponse.json({ centers, count });
  } catch (error) {
    console.error('Error fetching exam centers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exam centers' },
      { status: 500 }
    );
  }
}

// POST /api/tools/exam-centers - Search with location or filters (REQUIRES AUTH)
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required to get results. Please sign in.' },
        { status: 401 }
      );
    }

    const startTime = Date.now();
    const body = await request.json();
    const {
      state, city, search, latitude, longitude, maxDistance,
      confidence, tcsIonOnly, barchOnly, newOnly, tier,
    } = body;

    const supabase = getSupabaseBrowserClient();

    let centers;
    let count;

    // If coordinates provided, find nearest centers
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      centers = await findNearestNataExamCenters(
        latitude,
        longitude,
        { maxDistance: maxDistance || 500, limit: 30 },
        supabase
      );
      count = centers.length;
    } else {
      const result = await listNataExamCenters(
        { state, city, search, confidence, tcsIonOnly, barchOnly, newOnly, tier },
        supabase
      );
      centers = result.centers;
      count = result.count;
    }

    const executionTime = Date.now() - startTime;

    // Log tool usage with user ID (non-blocking)
    logToolUsage(
      {
        toolName: 'exam_center_locator',
        userId: user.uid,
        inputData: { state, city, search, latitude, longitude, confidence, tcsIonOnly },
        resultData: { count },
        executionTimeMs: executionTime,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase
    ).catch((err) => console.error('Failed to log tool usage:', err));

    return NextResponse.json({
      centers,
      count,
      executionTime,
    });
  } catch (error) {
    console.error('Error searching exam centers:', error);
    return NextResponse.json(
      { error: 'Failed to search exam centers' },
      { status: 500 }
    );
  }
}
