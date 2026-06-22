// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getClassroomsWithStudentCounts } from '@neram/database';

/**
 * GET /api/crm/alumni/classrooms
 * Classrooms with active student counts, for the "Graduate Batch" picker.
 */
export async function GET() {
  try {
    const classrooms = await getClassroomsWithStudentCounts();
    return NextResponse.json({ classrooms });
  } catch (error: any) {
    console.error('CRM alumni classrooms error:', error);
    return NextResponse.json({ error: error.message || 'Failed to list classrooms' }, { status: 500 });
  }
}
