import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getHallOfFameSeniors } from '@neram/database';

/**
 * GET /api/drawing/gallery/seniors?academicYear=&collegeId=
 * Seniors admins showcased in the Hall of Fame, each with their achievement and a
 * strip of their featured drawings. Any authenticated student may see this, it is
 * an inspiration surface (no visibility moderation, the works are already
 * curator-featured and gallery-visible).
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const params = request.nextUrl.searchParams;
    const academicYear = params.get('academicYear') || undefined;
    const collegeId = params.get('collegeId') || undefined;
    const seniors = await getHallOfFameSeniors({ academicYear, collegeId });
    return NextResponse.json({ seniors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
