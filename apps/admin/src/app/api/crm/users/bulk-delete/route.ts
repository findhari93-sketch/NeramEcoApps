export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminBulkDeleteUsers } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds, adminId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds array is required' },
        { status: 400 }
      );
    }

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required for audit trail' },
        { status: 400 }
      );
    }

    const result = await adminBulkDeleteUsers(userIds, adminId);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedUsers} user(s)`,
      ...result,
    });
  } catch (error: any) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete users' },
      { status: 500 }
    );
  }
}