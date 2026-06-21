// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { bulkArchiveUsers } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/users/bulk-archive
 * Archive many users at once (reversible). Does NOT delete or disable logins.
 * Body: { userIds: string[], adminId: string, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, adminId, reason } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds must be a non-empty array' },
        { status: 400 }
      );
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID).' },
        { status: 400 }
      );
    }

    const result = await bulkArchiveUsers(userIds, adminId, reason);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('CRM bulk-archive error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive users' },
      { status: 500 }
    );
  }
}
