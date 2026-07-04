// @ts-nocheck
export const dynamic = 'force-dynamic';
// Graph offboarding makes up to 2 calls per student; raise the budget so a full
// batch (~100 students) does not time out.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { listStudentsByYear, graduateStudentsToAlumni, updateAcademicBatch } from '@neram/database';
import { offboardMicrosoftAccounts } from '@/lib/ms-offboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/academic-batches/graduate
 * Close an exam-year batch and graduate its cohort: selects every ACTIVE
 * architecture student tagged with the batch code and runs the existing
 * graduation (revokes Nexus, deactivates enrollments, archives in CRM, stamps the
 * cohort, optionally offboards Microsoft), then marks the batch 'closed'. Software
 * students (non-aspirants) are never touched. Fully reversible via /api/crm/alumni/restore.
 * Body: { code: string, adminId: string, offboardMicrosoft?: boolean, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, adminId, offboardMicrosoft = false, reason } = body;

    if (!code || !ACADEMIC_YEAR_REGEX.test(code)) {
      return NextResponse.json({ error: 'code must be in YYYY-YY format, e.g. 2025-26.' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }

    // 1. Resolve the batch's active architecture students (aspirants only). The
    //    e2e-account guard inside listStudentsByYear keeps synthetic accounts out.
    const { students } = await listStudentsByYear({ year: code, program: 'architecture', status: 'active' });
    const userIds = students.map((s) => s.id);

    if (userIds.length === 0) {
      // Still mark the batch closed so the lifecycle reflects the admin's intent.
      await updateAcademicBatch(code, { status: 'closed' }, adminId);
      return NextResponse.json({ success: true, graduated: 0, ms: null, note: 'No active students in this batch.' });
    }

    // 2. Graduate (Nexus lockout + enrollments + CRM archive + cohort stamp).
    const result = await graduateStudentsToAlumni(userIds, adminId, {
      academicYear: code,
      reason: reason || `Batch ${code} closed`,
    });

    // 3. Best-effort Microsoft offboarding (never undoes the DB graduation).
    let ms: any = null;
    if (offboardMicrosoft) {
      ms = await offboardMicrosoftAccounts(userIds);
    }

    // 4. Close the batch.
    await updateAcademicBatch(code, { status: 'closed' }, adminId);

    return NextResponse.json({ success: true, ...result, ms });
  } catch (error: any) {
    console.error('Batch graduate error:', error);
    return NextResponse.json({ error: error.message || 'Failed to graduate batch' }, { status: 500 });
  }
}
