// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { bulkSetUserRole } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/set-role
 * "Mark as staff": reclassify users who were mis-created as students (e.g. by the
 * Entra sync, which defaults imports to user_type='student') into a staff role.
 * Setting role='teacher' removes them from the Students list and grants Nexus
 * teaching access; role='admin' additionally unlocks the admin dashboard.
 * Body: { userIds: string[], role: 'teacher' | 'admin', adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, role, adminId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array' }, { status: 400 });
    }
    if (!userIds.every((id: unknown) => typeof id === 'string' && UUID_REGEX.test(id))) {
      return NextResponse.json({ error: 'userIds must all be valid UUIDs.' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID (Supabase user ID).' }, { status: 400 });
    }
    if (role !== 'teacher' && role !== 'admin') {
      return NextResponse.json({ error: "role must be 'teacher' or 'admin'." }, { status: 400 });
    }

    const result = await bulkSetUserRole(userIds, role, adminId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM alumni set-role error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update role' }, { status: 500 });
  }
}
