// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listAlumni } from '@neram/database';

/**
 * GET /api/crm/alumni?academicYear=&search=&limit=&offset=
 * List graduated alumni (queried directly from users, so MS-only Nexus students
 * are included, unlike the firebase-scoped user_journey_view).
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const academicYear = params.get('academicYear') || undefined;
    const search = params.get('search') || undefined;
    const limit = params.get('limit') ? parseInt(params.get('limit')!) : 100;
    const offset = params.get('offset') ? parseInt(params.get('offset')!) : 0;

    const result = await listAlumni({ academicYear, search, limit, offset });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('CRM alumni list error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list alumni' }, { status: 500 });
  }
}
