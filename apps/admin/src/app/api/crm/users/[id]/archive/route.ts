// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { archiveUser, restoreUser } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/users/[id]/archive
 * Archive a user (reversible de-prioritize; does NOT delete or disable login).
 * Body: { adminId: string, reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId, reason } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID). Admin profile may not be resolved yet.' },
        { status: 400 }
      );
    }

    await archiveUser(params.id, adminId, reason);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM archive error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/crm/users/[id]/archive
 * Restore an archived user back to the active focus view.
 * Body: { adminId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { adminId } = body;

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID (Supabase user ID).' },
        { status: 400 }
      );
    }

    await restoreUser(params.id, adminId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM restore error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to restore user' },
      { status: 500 }
    );
  }
}
