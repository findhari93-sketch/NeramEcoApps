export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  addSupportTicketMessage,
  getSupabaseAdminClient,
  getSupportTicketByRef,
  getSupportTicketDetail,
  getTicketComments,
  requestSupportTicketInfo,
  resolveSupportTicket,
  startSupportTicket,
} from '@neram/database';
import type { SupportTicket } from '@neram/database';
import { canTicketMove, isTicketStaffOutcome } from '@neram/database/support-ticket-status';
import { resolveVerifiedStaff } from '@/lib/staff-actor';
import {
  MIN_NOTE_LENGTH,
  badRequest,
  cleanText,
  notFound,
  tellRequester,
  ticketChanged,
  unauthorized,
} from '@/lib/support-inbox/server';

type Params = { params: { id: string } };

function refOf(params: Params['params']): string {
  try {
    return decodeURIComponent(params.id || '').trim();
  } catch {
    return '';
  }
}

/** GET /api/support-tickets/[id]/comments: the whole thread, internal notes included (staff view). */
export async function GET(request: NextRequest, { params }: Params) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();
  try {
    const supabase = getSupabaseAdminClient() as any;
    const ticket = await getSupportTicketByRef(refOf(params), supabase);
    if (!ticket) return notFound();
    const comments = await getTicketComments(ticket.id, supabase, { includeInternal: true });
    return NextResponse.json({ success: true, data: comments });
  } catch (error) {
    console.error('Error fetching ticket comments:', error);
    return NextResponse.json({ error: 'Failed to fetch ticket comments' }, { status: 500 });
  }
}

type Then = 'none' | 'ask' | 'resolve';

/**
 * POST /api/support-tickets/[id]/comments
 *
 * { content, internal?: boolean, then?: 'none' | 'ask' | 'resolve', resolution_code? }
 *
 * An internal note is written and nothing else happens: no status change, no
 * notice to anyone. A public reply on a New ticket also starts it (and claims
 * it when nobody owns it). `then` asks the requester or resolves in the same
 * call; the reply is the question or the resolution note. The requester gets
 * one bell entry and one email for the whole call.
 *
 * Moves run before the message is written, so a 409 leaves the thread as it
 * was and the composer keeps the draft.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Send a JSON body with content.');
  }

  const content = cleanText(body?.content);
  if (!content) return badRequest('Write a message first.');
  const internal = body.internal === true;
  const then: Then = body.then === 'ask' || body.then === 'resolve' ? body.then : 'none';
  if (internal && then !== 'none') return badRequest('An internal note cannot ask or resolve. Send it as a reply.');

  try {
    const supabase = getSupabaseAdminClient() as any;
    const found = await getSupportTicketByRef(refOf(params), supabase);
    if (!found) return notFound();
    const actor = { id: staff.id, name: staff.name };

    if (internal) {
      const comment = await addSupportTicketMessage(found, { author: actor, side: 'staff', content, internal: true }, supabase);
      const detail = await getSupportTicketDetail(found.id, supabase);
      return NextResponse.json({ success: true, data: comment, ticket: detail });
    }

    // Check everything before the first write.
    const code = body.resolution_code;
    if (then === 'resolve') {
      if (!isTicketStaffOutcome(code)) return badRequest('Pick an outcome.');
      if (code === 'duplicate') return badRequest('Close it as a duplicate instead, so it links to the other ticket.');
      if (content.length < MIN_NOTE_LENGTH) return badRequest(`Write a note of at least ${MIN_NOTE_LENGTH} characters for the requester.`);
    }
    // From New the ticket is started first, so the follow-on move is judged from in_progress.
    const statusForThen = found.status === 'open' ? 'in_progress' : found.status;
    if (then === 'ask' && !canTicketMove(statusForThen, 'request_info', 'staff')) return ticketChanged('not_allowed');
    if (then === 'resolve' && !canTicketMove(statusForThen, 'resolve', 'staff')) return ticketChanged('not_allowed');

    let ticket: SupportTicket = found;
    if (ticket.status === 'open') {
      const started = await startSupportTicket(ticket, actor, supabase);
      if (!started) return ticketChanged('stale');
      ticket = started;
    }

    if (then === 'ask') {
      const moved = await requestSupportTicketInfo(ticket, actor, supabase);
      if (!moved) return ticketChanged('stale');
      ticket = moved;
    } else if (then === 'resolve' && isTicketStaffOutcome(code)) {
      const moved = await resolveSupportTicket(ticket, actor, { resolution_code: code, note: content }, supabase);
      if (!moved) return ticketChanged('stale');
      ticket = moved;
    }

    const comment = await addSupportTicketMessage(ticket, { author: actor, side: 'staff', content }, supabase);

    if (then === 'ask') {
      await tellRequester(ticket, 'info_requested', { message: content, staffName: staff.name, supabase });
    } else if (then === 'resolve' && isTicketStaffOutcome(code)) {
      await tellRequester(ticket, 'resolved', { message: content, staffName: staff.name, outcome: code, supabase });
    } else {
      await tellRequester(ticket, 'reply', { message: content, staffName: staff.name, supabase });
    }

    const detail = await getSupportTicketDetail(ticket.id, supabase);
    return NextResponse.json({ success: true, data: comment, ticket: detail });
  } catch (error) {
    console.error('Error adding ticket comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
