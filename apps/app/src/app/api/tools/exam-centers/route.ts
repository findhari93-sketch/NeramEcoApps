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

// GET /api/tools/exam-centers - List centers or get states/cities
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

    // Default: list all centers with optional filters
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

// POST /api/tools/exam-centers - Search with location or filters
export async function POST(request: NextRequest) {
  try {
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

    // Log tool usage (non-blocking)
    logToolUsage(
      {
        toolName: 'exam_center_locator',
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
