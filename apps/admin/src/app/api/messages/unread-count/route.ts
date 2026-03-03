// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUnreadContactMessageCount } from '@neram/database';

// GET /api/messages/unread-count - Get unread message count
export async function GET() {
  try {
    const count = await getUnreadContactMessageCount();

    return NextResponse.json({
      success: true,
      count,
    });
  } catch (error: any) {
    console.error('Error fetching unread message count:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch unread count' },
      { status: 500 }
    );
  }
}