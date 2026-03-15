// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { linkUserToClassroom, unlinkUserFromClassroom } from '@neram/database';

/**
 * POST /api/crm/users/[id]/classroom-link
 * Link a tools app user to their Nexus classroom email.
 * Body: { classroomEmail: string, adminId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { classroomEmail, adminId } = body;

    if (!classroomEmail || !adminId) {
      return NextResponse.json(
        { error: 'classroomEmail and adminId are required' },
        { status: 400 }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(adminId)) {
      return NextResponse.json(
        { error: 'adminId must be a valid UUID' },
        { status: 400 }
      );
    }

    await linkUserToClassroom(params.id, classroomEmail, adminId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM classroom link error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to link classroom' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/crm/users/[id]/classroom-link
 * Unlink a user from their Nexus classroom email.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await unlinkUserFromClassroom(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRM classroom unlink error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlink classroom' },
      { status: 500 }
    );
  }
}
