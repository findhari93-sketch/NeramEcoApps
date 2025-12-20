// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseBrowserClient,
  predictColleges,
  getDistinctStates,
  logToolUsage,
} from '@neram/database';

// GET /api/tools/college-predictor/states - Get available states
export async function GET() {
  try {
    const supabase = getSupabaseBrowserClient();
    const states = await getDistinctStates(supabase);

    return NextResponse.json({ states });
  } catch (error) {
    console.error('Error fetching states:', error);
    return NextResponse.json(
      { error: 'Failed to fetch states' },
      { status: 500 }
    );
  }
}

// POST /api/tools/college-predictor - Predict colleges
export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now();
    const body = await request.json();
    const { nataScore, category, state, examYear } = body;

    if (typeof nataScore !== 'number' || nataScore < 0 || nataScore > 200) {
      return NextResponse.json(
        { error: 'Invalid NATA score. Must be between 0 and 200' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseBrowserClient();

    const predictions = await predictColleges(
      {
        nataScore,
        category: category || 'General',
        state: state || undefined,
        examYear: examYear || new Date().getFullYear(),
        limit: 20,
      },
      supabase
    );

    const executionTime = Date.now() - startTime;

    // Log tool usage (non-blocking)
    logToolUsage(
      {
        toolName: 'college_predictor',
        inputData: { nataScore, category, state, examYear },
        resultData: { count: predictions.length },
        executionTimeMs: executionTime,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      supabase
    ).catch((err) => console.error('Failed to log tool usage:', err));

    return NextResponse.json({
      predictions,
      count: predictions.length,
      executionTime,
    });
  } catch (error) {
    console.error('Error predicting colleges:', error);
    return NextResponse.json(
      { error: 'Failed to predict colleges' },
      { status: 500 }
    );
  }
}
