// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getLatestExamSchedule, getActiveExamSchedule } from '@neram/database';

// GET /api/exam-schedule - Public endpoint for exam schedule
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examType = searchParams.get('exam') || 'nata';
    const yearParam = searchParams.get('year');

    let schedule;
    if (yearParam) {
      schedule = await getActiveExamSchedule(examType, Number(yearParam));
    } else {
      schedule = await getLatestExamSchedule(examType);
    }

    if (!schedule) {
      return NextResponse.json({ schedule: null });
    }

    return NextResponse.json({ schedule });
  } catch (err) {
    console.error('Error fetching exam schedule:', err);
    return NextResponse.json(
      { error: 'Failed to fetch exam schedule' },
      { status: 500 }
    );
  }
}
