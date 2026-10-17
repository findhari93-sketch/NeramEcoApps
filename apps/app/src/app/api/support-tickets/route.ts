export const dynamic = 'force-dynamic';

/**
 * Support Tickets API (Tools App, Firebase auth)
 *
 * POST /api/support-tickets  The "New request" form on /support. Same creation
 *                            path as the floating reporter (lib/student-ticket.ts):
 *                            rate limit, requester tag, Admin bell, email.
 * GET  /api/support-tickets  The signed-in person's own tickets, lean rows only.
 *                            Console logs and device info never leave the server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listUserTickets } from '@neram/database';
import type { SupportTicketStatus } from '@neram/database';
import { toStudentListRow } from '@/lib/student-ticket-view';
import {
  requireSignedInRequester,
  createStudentTicket,
  parseTicketCategory,
  rateLimitedResponse,
} from '@/lib/student-ticket';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => null);
    const subject = typeof body?.subject === 'string' ? body.subject : '';
    const description = typeof body?.description === 'string' ? body.description : '';

    if (!body?.category || typeof body.category !== 'string') {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }
    if (!subject.trim()) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    }
    if (!description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    // source_app is always 'app' here, whatever the body says (older clients
    // sent `sourceApp`, which this route never read).
    const result = await createStudentTicket(
      auth,
      {
        kind: 'request',
        category: parseTicketCategory(body.category, 'other'),
        subject,
        description,
        page_url: body.page_url,
        screenshot_urls: body.screenshot_urls,
        console_logs: body.console_logs,
        device_info: body.device_info,
        enrollment_link_id: typeof body.enrollment_link_id === 'string' ? body.enrollment_link_id : null,
      },
      getSupabaseAdminClient(),
    );
    if (!result.ok) return rateLimitedResponse(result);

    return NextResponse.json(
      {
        ticketNumber: result.ticket.ticket_number,
        ticketId: result.ticket.id,
        ticket_number: result.ticket.ticket_number,
        ticket_id: result.ticket.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const { data, total } = await listUserTickets(
      auth.userId,
      { status: status as SupportTicketStatus | undefined, page, limit },
      getSupabaseAdminClient(),
    );

    return NextResponse.json({ tickets: data.map(toStudentListRow), total, page, limit });
  } catch (error) {
    console.error('Error listing support tickets:', error);
    return NextResponse.json({ error: 'Failed to list support tickets' }, { status: 500 });
  }
}
