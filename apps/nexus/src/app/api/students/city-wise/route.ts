import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getCityStudentCounts } from '@neram/database';

/**
 * GET /api/students/city-wise
 *
 * Returns student counts grouped by city.
 * Accessible by teachers and admins.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const cities = await getCityStudentCounts();

    return NextResponse.json({ cities });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load city data';
    console.error('City-wise students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
