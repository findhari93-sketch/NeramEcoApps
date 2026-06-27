// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { bulkSetAcademicYear } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/crm/alumni/set-year
 * Backfill / bulk-set the academic-year cohort on active students, so they can
 * then be selected by year for graduation.
 * Body: { userIds: string[], academicYear: string, adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, academicYear, adminId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!academicYear || !ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return NextResponse.json({ error: 'academicYear must be in YYYY-YY format, e.g. 2025-26.' }, { status: 400 });
    }

    const result = await bulkSetAcademicYear(userIds, academicYear, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni set-year error:', error);
    return NextResponse.json({ error: error.message || 'Failed to set academic year' }, { status: 500 });
  }
}
