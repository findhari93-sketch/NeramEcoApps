export const dynamic = 'force-dynamic';

/**
 * Reply on your own ticket (Tools App, Firebase auth).
 *
 * POST /api/support-tickets/[id]/comments  { content }
 *
 *  - Closed tickets take no replies: 409, use "Still happening" instead, which
 *    reopens it with a fresh snapshot.
 *  - A reply while staff wait on you puts the ticket back to work (resume).
 *  - Every reply rings the Admin bell.
 *
 * Somebody else's ticket answers 404, the same as one that does not exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getSupportTicketByRef,
  addSupportTicketMessage,
  resumeSupportTicket,
  createAdminNotification,
} from '@neram/database';
import { requireSignedInRequester } from '@/lib/student-ticket';

const MAX_REPLY = 5000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const ticket = id ? await getSupportTicketByRef(id, supabase) : null;
    if (!ticket || ticket.user_id !== auth.userId) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      return NextResponse.json(
        { error: 'ticket_closed', message: 'This request is closed. Use Still happening to reopen it.' },
        { status: 409 },
      );
    }

    const actor = { id: auth.userId, name: auth.userName };
    const comment = await addSupportTicketMessage(
      ticket,
      { author: actor, side: 'student', content: content.slice(0, MAX_REPLY) },
      supabase,
    );

    let status: string = ticket.status;
    if (ticket.status === 'waiting_on_student') {
      // Null means staff moved it in the meantime; the reply still stands.
      const moved = await resumeSupportTicket(ticket, actor, supabase, { byStudent: true });
      if (moved) status = moved.status;
    }

    try {
      await createAdminNotification({
        event_type: 'ticket_student_replied',
        title: 'Student replied',
        message: `${auth.userName} replied on ${ticket.ticket_number}: "${content.slice(0, 140)}"`,
        metadata: { ticket_id: ticket.id, ticket_number: ticket.ticket_number, source_app: 'app' },
      });
    } catch (err) {
      console.error('[support-tickets] reply notification failed:', err);
    }

    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          side: 'student',
          author_label: 'You',
          content: comment.content,
          created_at: comment.created_at,
        },
        status,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error adding ticket comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
