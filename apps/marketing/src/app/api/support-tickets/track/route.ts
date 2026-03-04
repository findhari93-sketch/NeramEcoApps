export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getSupportTicketByNumber, getTicketComments } from '@neram/database';

/**
 * GET /api/support-tickets/track?ticket=NERAM-TKT-00001
 *
 * Public endpoint — returns limited ticket info (no internal notes, no assignment details).
 * Used by the public ticket tracking page for non-logged-in users.
 */
export async function GET(request: NextRequest) {
  try {
    const ticketNumber = request.nextUrl.searchParams.get('ticket');

    if (!ticketNumber || !ticketNumber.startsWith('NERAM-TKT-')) {
      return NextResponse.json(
        { error: 'Valid ticket number is required (e.g., NERAM-TKT-00001)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const ticket = await getSupportTicketByNumber(ticketNumber, supabase);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found. Please check the ticket number and try again.' },
        { status: 404 }
      );
    }

    // Fetch comments (only admin replies visible publicly, not internal)
    const comments = await getTicketComments(ticket.id, supabase);
    const publicComments = comments
      .filter((c) => c.is_admin)
      .map((c) => ({
        content: c.content,
        created_at: c.created_at,
      }));

    // Return only safe, public-facing fields
    return NextResponse.json({
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      resolved_at: ticket.resolved_at,
      resolution_notes: ticket.resolution_notes,
      comments: publicComments,
    });
  } catch (error) {
    console.error('Error tracking support ticket:', error);
    return NextResponse.json(
      { error: 'Failed to look up ticket. Please try again later.' },
      { status: 500 }
    );
  }
}
