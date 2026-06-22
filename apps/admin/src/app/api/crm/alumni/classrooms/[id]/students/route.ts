// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClassroomStudentsForGraduation } from '@neram/database';

/**
 * GET /api/crm/alumni/classrooms/[id]/students
 * Active students in a classroom (with their alumni state) for the graduation preview.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const students = await getClassroomStudentsForGraduation(params.id);
    return NextResponse.json({ students });
  } catch (error: any) {
    console.error('CRM alumni classroom students error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list students' }, { status: 500 });
  }
}
