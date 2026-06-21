// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { recordExamStatus } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;
const VALID_EXAM_STATUS = ['writing_exam_this_year', 'completed_exam', 'not_sure', 'not_writing'];

/**
 * POST /api/crm/users/[id]/verify-status
 * Record the student's answer to the "are you writing the exam?" outreach.
 * Body: { adminId: string, examStatus: string, academicYear?: string, archive?: boolean, reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId, examStatus, academicYear, archive, reason } = body;

    if (!adminId || !examStatus) {
      return NextResponse.json(
        { error: 'adminId and examStatus are required' },
        { status: 400 }
      );
    }
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID).' },
        { status: 400 }
      );
    }
    if (!VALID_EXAM_STATUS.includes(examStatus)) {
      return NextResponse.json(
        { error: `examStatus must be one of: ${VALID_EXAM_STATUS.join(', ')}` },
        { status: 400 }
      );
    }
    if (academicYear && !ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return NextResponse.json(
        { error: 'academicYear must be in YYYY-YY format, e.g. 2026-27' },
        { status: 400 }
      );
    }

    await recordExamStatus(params.id, examStatus, adminId, {
      academicYear: academicYear || undefined,
      archive: Boolean(archive),
      reason: reason || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM verify-status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record exam status' },
      { status: 500 }
    );
  }
}
