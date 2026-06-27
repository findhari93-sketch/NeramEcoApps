// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAlumniDirectory } from '@neram/database';

/**
 * GET /api/crm/alumni?search=&academicYear=&collegeId=&course=&verified=
 * Alumni directory: graduated students enriched with their college/course/social
 * profile and a drawing-submission count. Queried directly from `users` (so
 * MS-only Nexus students are included, unlike the firebase-scoped journey view).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const verifiedParam = params.get('verified');

    const result = await getAlumniDirectory({
      search: params.get('search') || undefined,
      academicYear: params.get('academicYear') || undefined,
      collegeId: params.get('collegeId') || undefined,
      course: params.get('course') || undefined,
      verified: verifiedParam === null ? undefined : verifiedParam === 'true',
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('CRM alumni directory error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list alumni' }, { status: 500 });
  }
}
