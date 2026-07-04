import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { listAcademicBatches, getCurrentBatch } from '@neram/database';

// Per-request auth (verifyMsToken), so this is inherently dynamic.
export const dynamic = 'force-dynamic';

/**
 * GET /api/batches - read-only exam-year batch registry for Nexus.
 *
 * This is the EXAM-YEAR COHORT (users.academic_year, e.g. '2026-27'), used by
 * teachers/admins to scope their student views. It is NOT `nexus_batches`
 * (classroom sections) and NOT the course-class `batches` table.
 *
 * Returns: { current: AcademicBatch, batches: AcademicBatch[] }
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const [batches, current] = await Promise.all([listAcademicBatches(), getCurrentBatch()]);
    return NextResponse.json({ current, batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load batches';
    console.error('Nexus batches GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
