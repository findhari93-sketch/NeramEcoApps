// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listActiveNexusStudents } from '@neram/database';

/**
 * GET /api/crm/alumni/students
 * Flat, searchable list of active (non-alumni) Nexus students for the graduation
 * workspace. NOT classroom-scoped: students belong to many classrooms, so the
 * organising concept is the academic year.
 * Query params:
 *  - search: name / email
 *  - academicYear: 'YYYY-YY' | 'none' (no year set) | 'all'
 *  - activity: 'all' | 'inactive' (zero drawing submissions)
 *  - program: 'architecture' (default) | 'software' — the /software page passes
 *    'software' to get the separated software-course list.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const academicYear = searchParams.get('academicYear') || undefined;
    const activity = (searchParams.get('activity') as 'all' | 'inactive') || 'all';
    const program = searchParams.get('program') === 'software' ? 'software' : 'architecture';

    const result = await listActiveNexusStudents({ search, academicYear, activity, program });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('CRM alumni students error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list students' }, { status: 500 });
  }
}
