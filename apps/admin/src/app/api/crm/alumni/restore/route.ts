// @ts-nocheck
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { restoreAlumniToActive } from '@neram/database';
import { reinstateMicrosoftAccounts } from '@/lib/ms-offboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/restore
 * Reverse graduation: clears the alumni gate and CRM archive, and (optionally)
 * reinstates the Microsoft account: re-enables sign-in and re-adds the licenses
 * that were removed at graduation. Re-enrolling into classrooms stays a manual step.
 * Body: { userIds: string[], adminId: string, reinstateMicrosoft?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, adminId, reinstateMicrosoft = true } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }

    // 1. Reinstate Microsoft first (re-enable + re-add licenses), best-effort.
    let ms: any = null;
    if (reinstateMicrosoft) {
      ms = await reinstateMicrosoftAccounts(userIds);
    }

    // 2. Clear the Nexus alumni gate + CRM archive.
    const result = await restoreAlumniToActive(userIds, adminId);

    return NextResponse.json({ success: true, ...result, ms });
  } catch (error: any) {
    console.error('CRM alumni restore error:', error);
    return NextResponse.json({ error: error.message || 'Failed to restore alumni' }, { status: 500 });
  }
}
