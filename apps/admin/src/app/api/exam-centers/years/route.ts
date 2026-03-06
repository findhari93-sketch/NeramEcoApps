import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDistinctYears,
} from '@neram/database';

// GET /api/exam-centers/years — List available years
export async function GET() {
  try {
    const client = getSupabaseAdminClient();
    const years = await getDistinctYears(client);

    return NextResponse.json({ data: years });
  } catch (error) {
    console.error('Error getting years:', error);
    const msg = error instanceof Error ? error.message : 'Failed to get years';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
