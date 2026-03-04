// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listSupportTickets,
  updateSupportTicket,
  getSupportTicketStats,
} from '@neram/database';
import type { SupportTicketStatus, SupportTicketCategory } from '@neram/database';

// GET /api/support-tickets - List all tickets with filters (admin view)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as SupportTicketStatus | null;
    const category = searchParams.get('category') as SupportTicketCategory | null;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const includeStats = searchParams.get('stats') === 'true';

    const supabase = getSupabaseAdminClient();

    const { data: tickets, total } = await listSupportTickets(
      {
        status: status || undefined,
        category: category || undefined,
        search,
        page,
        limit,
      },
      supabase
    );

    const response: Record<string, unknown> = {
      success: true,
      data: tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Optionally include stats
    if (includeStats) {
      const stats = await getSupportTicketStats(supabase);
      response.stats = stats;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing support tickets:', error);
    return NextResponse.json(
      { error: 'Failed to list support tickets' },
      { status: 500 }
    );
  }
}

// PATCH /api/support-tickets - Quick status/priority update from the list
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, priority } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No update fields provided' },
        { status: 400 }
      );
    }

    const ticket = await updateSupportTicket(id, updates, supabase);

    return NextResponse.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return NextResponse.json(
      { error: 'Failed to update support ticket' },
      { status: 500 }
    );
  }
}
