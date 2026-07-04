// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getRevenueByYear } from '@neram/database';

// GET /api/students/revenue-by-year - Per-academic-year fee rollup for the
// /students hub "Revenue overview". Loaded lazily (only when the overview is
// opened) to keep function invocations down.
export async function GET() {
  try {
    const years = await getRevenueByYear({ program: 'architecture' });
    return NextResponse.json({ years });
  } catch (error: any) {
    console.error('Error computing revenue-by-year:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to compute revenue by year' },
      { status: 500 }
    );
  }
}
