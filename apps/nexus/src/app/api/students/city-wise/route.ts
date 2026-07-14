import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getActiveGeoStudents } from '@/lib/geo-students';
import type { CityStudentCount } from '@neram/database';

/**
 * GET /api/students/city-wise
 *
 * Returns student counts grouped by city, for the active population only
 * (current + future exam years, alumni excluded). Teachers/admins only.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const students = await getActiveGeoStudents();

    const map = new Map<string, { count: number; state: string | null }>();
    for (const s of students) {
      const existing = map.get(s.city);
      if (existing) existing.count += 1;
      else map.set(s.city, { count: 1, state: s.state });
    }

    const cities: CityStudentCount[] = Array.from(map.entries())
      .map(([city, { count, state }]) => ({ city, student_count: count, state }))
      .sort((a, b) => b.student_count - a.student_count);

    return NextResponse.json({ cities });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load city data';
    console.error('City-wise students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
