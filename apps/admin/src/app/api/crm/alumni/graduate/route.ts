// @ts-nocheck
export const dynamic = 'force-dynamic';
// Graph offboarding makes up to 2 calls per student; raise the function budget so
// a real batch (~100 students) does not time out. Bounded concurrency in the lib
// keeps it well under this ceiling.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { graduateStudentsToAlumni } from '@neram/database';
import { offboardMicrosoftAccounts } from '@/lib/ms-offboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/**
 * POST /api/crm/alumni/graduate
 * Graduate a set of students to alumni: revokes Nexus access (is_alumni),
 * deactivates their Nexus enrollments, archives them in the CRM, stamps the cohort
 * year, and (optionally) offboards their Microsoft account: removes the M365
 * license and disables sign-in. Fully reversible via /api/crm/alumni/restore.
 * Body: { userIds: string[], academicYear: string, adminId: string, reason?: string, offboardMicrosoft?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, academicYear, adminId, reason, offboardMicrosoft = true } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (!academicYear || !ACADEMIC_YEAR_REGEX.test(academicYear)) {
      return NextResponse.json({ error: 'academicYear must be in YYYY-YY format, e.g. 2025-26.' }, { status: 400 });
    }

    // 1. DB graduation (Nexus lockout + enrollments + CRM archive + cohort stamp).
    const result = await graduateStudentsToAlumni(userIds, adminId, { academicYear, reason });

    // 2. Microsoft offboarding (best-effort, never undoes the DB graduation).
    let ms: any = null;
    if (offboardMicrosoft) {
      ms = await offboardMicrosoftAccounts(userIds);
    }

    return NextResponse.json({ success: true, ...result, ms });
  } catch (error: any) {
    console.error('CRM alumni graduate error:', error);
    return NextResponse.json({ error: error.message || 'Failed to graduate students' }, { status: 500 });
  }
}
