import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getStudentsByCity } from '@neram/database';

/**
 * GET /api/students/city-wise/[city]?search=&limit=&offset=
 *
 * Returns students in a specific city with search and pagination.
 * Accessible by teachers and admins.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { city: string } }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const city = decodeURIComponent(params.city);
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const result = await getStudentsByCity({ city, search, limit, offset });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load students';
    console.error('City students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
