// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getSupportTicketById,
  getTicketComments,
  updateSupportTicket,
  createUserNotification,
} from '@neram/database';

// GET /api/support-tickets/[id] - Get ticket detail with comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const ticket = await getSupportTicketById(id, supabase);
    if (!ticket) {
      return NextResponse.json(
        { error: 'Support ticket not found' },
        { status: 404 }
      );
    }

    const comments = await getTicketComments(id, supabase);

    return NextResponse.json({
      success: true,
      data: {
        ...ticket,
        comments,
      },
    });
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    return NextResponse.json(
      { error: 'Failed to fetch support ticket' },
      { status: 500 }
    );
  }
}

// PATCH /api/support-tickets/[id] - Update ticket (assign, resolve, change status/priority)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, priority, assigned_to, resolution_notes } = body;

    const supabase = getSupabaseAdminClient();

    const existing = await getSupportTicketById(id, supabase);
    if (!existing) {
      return NextResponse.json(
        { error: 'Support ticket not found' },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (assigned_to !== undefined) {
      updates.assigned_to = assigned_to;
      updates.assigned_at = new Date().toISOString();
    }
    if (resolution_notes !== undefined) updates.resolution_notes = resolution_notes;

    // If resolving, set resolved_by and resolved_at
    if (status === 'resolved') {
      updates.resolved_by = body.resolved_by || assigned_to || null;
      updates.resolved_at = new Date().toISOString();
    }

    const ticket = await updateSupportTicket(id, updates, supabase);

    // If resolved and ticket has a user_id, create a user notification
    if (status === 'resolved' && existing.user_id) {
      try {
        await createUserNotification(
          {
            user_id: existing.user_id,
            event_type: 'ticket_resolved',
            title: 'Ticket Resolved',
            message: `Your support ticket ${existing.ticket_number} has been resolved.`,
            metadata: {
              ticket_id: existing.id,
              ticket_number: existing.ticket_number,
              category: existing.category,
              subject: existing.subject,
            },
          },
          supabase
        );
      } catch (notifError) {
        // Log but don't fail the main operation
        console.error('Failed to create user notification for ticket resolution:', notifError);
      }
    }

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
