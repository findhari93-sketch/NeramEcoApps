// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setUserAcademicYear, getSupabaseAdminClient } from '@neram/database';
import { isCurrentBatch, syncUserToDefaultClassroom } from '@/lib/nexus-enroll';
import { examYearFromAcademicYear } from '@/components/crm/academic-years';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/crm/users/[id]/academic-year
 * Set or update a user's academic-year cohort (format YYYY-YY, e.g. 2026-27).
 * Body: { adminId: string, academicYear: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId, academicYear } = body;

    if (!adminId || !academicYear) {
      return NextResponse.json(
        { error: 'adminId and academicYear are required' },
        { status: 400 }
      );
    }
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID).' },
        { status: 400 }
      );
    }
    if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return NextResponse.json(
        { error: 'academicYear must be in YYYY-YY format, e.g. 2026-27' },
        { status: 400 }
      );
    }

    await setUserAcademicYear(params.id, academicYear, adminId);

    // Batch and target exam year are one concept: keep lead_profiles.target_exam_year
    // mirrored (e.g. 2026-27 -> 2027) so the CRM/drawer display stays consistent.
    // Best-effort: a failure here must not fail the batch assignment.
    try {
      const supabase = getSupabaseAdminClient() as any;
      await supabase
        .from('lead_profiles')
        .update({ target_exam_year: examYearFromAcademicYear(academicYear) })
        .eq('user_id', params.id);
    } catch {
      /* non-blocking */
    }

    // If this places the student into the CURRENT batch, auto-add them to the
    // single classroom + Team + group chat. Best-effort: a Graph hiccup must not
    // fail the year assignment.
    let classroomSync: any = null;
    try {
      const supabase = getSupabaseAdminClient() as any;
      if (await isCurrentBatch(supabase, academicYear)) {
        classroomSync = await syncUserToDefaultClassroom(supabase, params.id, 'set_academic_year');
      }
    } catch {
      /* non-blocking */
    }

    return NextResponse.json({ success: true, classroomSync });
  } catch (error: any) {
    console.error('CRM academic-year error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to set academic year' },
      { status: 500 }
    );
  }
}
