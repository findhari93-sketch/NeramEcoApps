import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getActiveGeoStudents, filterStudentsInCity } from '@/lib/geo-students';

/**
 * GET /api/students/city-wise/[city]?state=&country=&search=&limit=&offset=
 *
 * Returns active students in a specific city. `state` / `country` disambiguate
 * same-named cities across states (the 4-level drill passes them). Alumni and
 * past-cohort students are excluded (see lib/geo-students.ts). Teachers/admins only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { city: string } },
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const city = decodeURIComponent(params.city);
    const state = request.nextUrl.searchParams.get('state') || undefined;
    const country = request.nextUrl.searchParams.get('country') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const all = await getActiveGeoStudents();
    const result = filterStudentsInCity(all, { city, state, country, search, limit, offset });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('City students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
