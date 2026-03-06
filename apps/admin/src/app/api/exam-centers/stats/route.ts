import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getNataExamCentersStats,
} from '@neram/database';

// GET /api/exam-centers/stats?year=2025 — Stats overview
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : new Date().getFullYear();

    const client = getSupabaseAdminClient();
    const stats = await getNataExamCentersStats(year, client);

    return NextResponse.json({ data: stats });
  } catch (error) {
    console.error('Error getting exam center stats:', error);
    const msg = error instanceof Error ? error.message : 'Failed to get stats';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
