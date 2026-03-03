// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getContactMessages } from '@neram/database';
import type { ContactMessageFilters } from '@neram/database';

// GET /api/messages - List contact messages with pagination + status filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ContactMessageFilters['status'] | null;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const filters: ContactMessageFilters = {
      page,
      limit,
    };

    if (status && ['unread', 'read', 'replied'].includes(status)) {
      filters.status = status;
    }

    const { data: messages, total } = await getContactMessages(filters);

    return NextResponse.json({
      success: true,
      data: messages,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('Error fetching contact messages:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}