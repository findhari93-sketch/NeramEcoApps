export const dynamic = 'force-dynamic';

/**
 * Tools App "Report a problem" (Firebase auth) → the Admin support inbox.
 *
 * POST /api/error-reports
 *
 * Anyone signed in may report, enrolled students and leads alike. The ticket
 * is tagged with which (requester_segment), rate limited to five a day, and
 * written to support_tickets only, never to the Nexus teacher inbox. All of
 * that lives in lib/student-ticket.ts, shared with POST /api/support-tickets.
 *
 * Body: { title, description?, category?, page_url?, screenshot_urls?,
 *         device_info?, console_logs? }
 * 201 { ticket_number, ticket_id, issue_id }   (issue_id kept for older clients)
 * 429 { error: 'rate_limited', message }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
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
    if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const result = await createStudentTicket(
      auth,
      {
        kind: 'report',
        category: parseTicketCategory(body.category, 'technical_issue'),
        subject: body.title,
        description: typeof body.description === 'string' ? body.description : '',
        page_url: body.page_url,
        screenshot_urls: body.screenshot_urls,
        console_logs: body.console_logs,
        device_info: body.device_info,
      },
      getSupabaseAdminClient(),
    );
    if (!result.ok) return rateLimitedResponse(result);

    return NextResponse.json(
      {
        ticket_number: result.ticket.ticket_number,
        ticket_id: result.ticket.id,
        issue_id: result.ticket.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[error-reports] failed to create report:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
