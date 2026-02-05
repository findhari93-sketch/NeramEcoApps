// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseBrowserClient,
  listExamCenters,
  searchExamCenters,
  getExamCenterStates,
  getExamCenterCities,
  findNearestExamCenters,
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
      const states = await getExamCenterStates(supabase);
      return NextResponse.json({ states });
    }

    if (action === 'cities') {
      const state = searchParams.get('state') || undefined;
      const cities = await getExamCenterCities(state, supabase);
      return NextResponse.json({ cities });
    }

    // Default: list all centers with optional filters (public preview)
    const state = searchParams.get('state') || undefined;
    const city = searchParams.get('city') || undefined;
    const search = searchParams.get('search') || undefined;

    const { centers, count } = await listExamCenters(
      { state, city, search },
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
    const { state, city, search, latitude, longitude, maxDistance } = body;

    const supabase = getSupabaseBrowserClient();

    let centers;
    let count;

    // If coordinates provided, find nearest centers
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      centers = await findNearestExamCenters(
        latitude,
        longitude,
        { maxDistance: maxDistance || 100, limit: 20 },
        supabase
      );
      count = centers.length;
    } else if (search) {
      centers = await searchExamCenters(search, { state, city }, supabase);
      count = centers.length;
    } else {
      const result = await listExamCenters({ state, city }, supabase);
      centers = result.centers;
      count = result.count;
    }

    const executionTime = Date.now() - startTime;

    // Log tool usage with user ID (non-blocking)
    logToolUsage(
      {
        toolName: 'exam_center_locator',
        userId: user.uid,
        inputData: { state, city, search, latitude, longitude },
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
