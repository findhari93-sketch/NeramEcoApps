// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listAcademicBatches,
  getCurrentBatch,
  createAcademicBatch,
  updateAcademicBatch,
  setCurrentBatch,
  getBatchNeedsAssignmentCounts,
} from '@neram/database';

// EXAM-YEAR COHORT registry API (users.academic_year). Deliberately NOT at
// /api/batches, which already serves the course-class `batches` table, and
// unrelated to `nexus_batches` (classroom section). The 'YYYY-YY' code is the key.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/academic-batches
 * Registry + the single current batch + the "needs batch" worklist counts.
 * This is the source of truth every admin user-list reads its current batch from.
 */
export async function GET() {
  try {
    const [batches, current, needsAssignment] = await Promise.all([
      listAcademicBatches(),
      getCurrentBatch(),
      getBatchNeedsAssignmentCounts(),
    ]);
    return NextResponse.json({ current, batches, needsAssignment });
  } catch (error: any) {
    console.error('GET /api/academic-batches error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load batches' }, { status: 500 });
  }
}

/**
 * POST /api/academic-batches - create a new exam-year batch.
 * Body: { code, label?, start_date?, end_date?, status?, adminId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, label, start_date, end_date, status, adminId } = body;
    if (adminId && !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }
    const batch = await createAcademicBatch(
      { code, label, start_date, end_date, status },
      adminId || null
    );
    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    console.error('POST /api/academic-batches error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create batch' }, { status: 400 });
  }
}

/**
 * PATCH /api/academic-batches - edit a batch, or make one current.
 * Set current:  { action: 'set-current', code, adminId }
 * Edit fields:  { code, label?, start_date?, end_date?, status?, adminId }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, code, label, start_date, end_date, status, adminId } = body;
    if (!code) {
      return NextResponse.json({ error: 'code is required.' }, { status: 400 });
    }
    if (adminId && !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }

    if (action === 'set-current') {
      const batch = await setCurrentBatch(code, adminId || null);
      return NextResponse.json({ success: true, batch });
    }

    const patch: Record<string, unknown> = {};
    if ('label' in body) patch.label = label;
    if ('start_date' in body) patch.start_date = start_date;
    if ('end_date' in body) patch.end_date = end_date;
    if ('status' in body) patch.status = status;
    const batch = await updateAcademicBatch(code, patch, adminId || null);
    return NextResponse.json({ success: true, batch });
  } catch (error: any) {
    console.error('PATCH /api/academic-batches error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update batch' }, { status: 400 });
  }
}
