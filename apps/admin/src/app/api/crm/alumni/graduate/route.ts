// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { graduateStudentsToAlumni } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/crm/alumni/graduate
 * Graduate a batch of students to alumni: revokes Nexus access (is_alumni),
 * deactivates their Nexus enrollments, archives them in the CRM, and stamps the
 * cohort year. Reversible via /api/crm/alumni/restore.
 * Body: { userIds: string[], academicYear: string, adminId: string, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, academicYear, adminId, reason } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!academicYear || !ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return NextResponse.json({ error: 'academicYear must be in YYYY-YY format, e.g. 2025-26.' }, { status: 400 });
    }

    const result = await graduateStudentsToAlumni(userIds, adminId, { academicYear, reason });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni graduate error:', error);
    return NextResponse.json({ error: error.message || 'Failed to graduate students' }, { status: 500 });
  }
}
