export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  assignSupportTicket,
  closeSupportTicketByStaff,
  confirmSupportTicket,
  getSupabaseAdminClient,
  getSupportTicketByRef,
  getSupportTicketDetail,
  markSupportTicketSeen,
  addSupportTicketMessage,
  reopenSupportTicket,
  requestSupportTicketInfo,
  resolveSupportTicket,
  resumeSupportTicket,
  setSupportTicketField,
  startSupportTicket,
} from '@neram/database';
import type { SupportTicket, SupportTicketCategory, SupportTicketPriority } from '@neram/database';
import {
  TICKET_CATEGORY_LABEL,
  canTicketMove,
  isTicketStaffOutcome,
  type TicketMove,
} from '@neram/database/support-ticket-status';
import { resolveVerifiedStaff } from '@/lib/staff-actor';
import {
  MIN_NOTE_LENGTH,
  badRequest,
  cleanText,
  getRequesterSummary,
  isStaffUser,
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

/**
 * GET /api/support-tickets/[id]: one ticket for the inbox detail pane.
 *
 * [id] is the UUID or the ticket number (NERAM-TKT-00001). Returns every
 * comment (internal notes included), the activity log and a requester card.
 * ?seen=1 marks the thread read for staff.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();

  try {
    const supabase = getSupabaseAdminClient() as any;
    const detail = await getSupportTicketDetail(refOf(params), supabase);
    if (!detail) return notFound();

    const seen = new URL(request.url).searchParams.get('seen') === '1';
    const [requester] = await Promise.all([
      getRequesterSummary(detail, supabase),
      seen ? markSupportTicketSeen(detail.id, 'staff', supabase) : Promise.resolve(),
    ]);

    return NextResponse.json({
      success: true,
      data: seen ? { ...detail, staff_seen_at: new Date().toISOString() } : detail,
      requester,
    });
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    return NextResponse.json({ error: 'Failed to fetch support ticket' }, { status: 500 });
  }
}

const PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high'];
const MOVES: TicketMove[] = ['start', 'request_info', 'resume', 'resolve', 'close', 'confirm', 'reopen'];

/**
 * PATCH /api/support-tickets/[id]: one move per call.
 *
 * { action: 'start' }
 * { action: 'assign', assignee_id: '<users.id>' | 'me' | null }
 * { action: 'request_info', note }            the question, posted to the thread
 * { action: 'resume' }
 * { action: 'resolve', resolution_code, note } note of 10+ characters
 * { action: 'close', resolution_code, note, duplicate_of_ref? }
 * { action: 'confirm' }
 * { action: 'reopen', reason? }
 * { action: 'priority', value }  { action: 'category', value }
 *
 * The acting staff member is the verified caller, never a name or id in the
 * body. 409 when the move is not allowed from the ticket's status, or when
 * someone else moved it first.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const staff = await resolveVerifiedStaff(request);
  if (!staff) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('Send a JSON body with an action.');
  }
  const action = typeof body?.action === 'string' ? body.action : '';

  try {
    const supabase = getSupabaseAdminClient() as any;
    const ticket = await getSupportTicketByRef(refOf(params), supabase);
    if (!ticket) return notFound();
    const actor = { id: staff.id, name: staff.name };

    if ((MOVES as string[]).includes(action) && !canTicketMove(ticket.status, action as TicketMove, 'staff')) {
      return ticketChanged('not_allowed');
    }

    let updated: SupportTicket | null = null;

    switch (action) {
      case 'start': {
        updated = await startSupportTicket(ticket, actor, supabase);
        if (!updated) return ticketChanged('stale');
        await tellRequester(updated, 'started', { staffName: staff.name, supabase });
        break;
      }

      case 'assign': {
        if (!canTicketMove(ticket.status, 'assign', 'staff')) return ticketChanged('not_allowed');
        const raw = body.assignee_id;
        let assignee: string | null;
        if (raw === null) assignee = null;
        else if (raw === 'me') assignee = staff.id;
        else if (typeof raw === 'string' && raw.trim()) {
          assignee = raw.trim();
          if (!(await isStaffUser(assignee, supabase))) return badRequest('Pick someone from the staff list.');
        } else return badRequest('assignee_id must be a staff id, "me" or null.');
        updated = await assignSupportTicket(ticket, assignee, actor, supabase);
        break;
      }

      case 'request_info': {
        const note = cleanText(body.note);
        if (!note) return badRequest('Write what you need from the requester.');
        updated = await requestSupportTicketInfo(ticket, actor, supabase);
        if (!updated) return ticketChanged('stale');
        await addSupportTicketMessage(updated, { author: actor, side: 'staff', content: note }, supabase);
        await tellRequester(updated, 'info_requested', { message: note, staffName: staff.name, supabase });
        break;
      }

      case 'resume': {
        updated = await resumeSupportTicket(ticket, actor, supabase);
        if (!updated) return ticketChanged('stale');
        break;
      }

      case 'resolve': {
        const code = body.resolution_code;
        if (!isTicketStaffOutcome(code)) return badRequest('Pick an outcome.');
        if (code === 'duplicate') return badRequest('Close it as a duplicate instead, so it links to the other ticket.');
        const note = cleanText(body.note);
        if (note.length < MIN_NOTE_LENGTH) return badRequest(`Write a note of at least ${MIN_NOTE_LENGTH} characters for the requester.`);
        updated = await resolveSupportTicket(ticket, actor, { resolution_code: code, note }, supabase);
        if (!updated) return ticketChanged('stale');
        await tellRequester(updated, 'resolved', { message: note, staffName: staff.name, outcome: code, supabase });
        break;
      }

      case 'close': {
        const code = body.resolution_code;
        if (!isTicketStaffOutcome(code)) return badRequest('Pick an outcome.');
        let note = cleanText(body.note);
        let duplicateOf: string | null = null;
        if (code === 'duplicate') {
          const ref = cleanText(body.duplicate_of_ref, 64);
          if (!ref) return badRequest('Give the ticket number this one duplicates.');
          const original = await getSupportTicketByRef(ref, supabase);
          if (!original) return badRequest(`No ticket ${ref} was found.`);
          if (original.id === ticket.id) return badRequest('A ticket cannot duplicate itself.');
          duplicateOf = original.id;
          if (!note) note = `This is covered by ticket ${original.ticket_number}. We will follow up there.`;
        } else if (note.length < MIN_NOTE_LENGTH) {
          return badRequest(`Write a note of at least ${MIN_NOTE_LENGTH} characters for the requester.`);
        }
        updated = await closeSupportTicketByStaff(ticket, actor, { resolution_code: code, note, duplicate_of: duplicateOf }, supabase);
        if (!updated) return ticketChanged('stale');
        await tellRequester(updated, 'closed', { message: note, staffName: staff.name, outcome: code, supabase });
        break;
      }

      case 'confirm': {
        updated = await confirmSupportTicket(ticket, actor, supabase);
        if (!updated) return ticketChanged('stale');
        break;
      }

      case 'reopen': {
        const reason = cleanText(body.reason) || null;
        updated = await reopenSupportTicket(ticket, actor, { reason, snapshot: null }, supabase);
        if (!updated) return ticketChanged('stale');
        break;
      }

      case 'priority': {
        const value = body.value;
        if (!PRIORITIES.includes(value as SupportTicketPriority)) return badRequest('Priority must be low, medium or high.');
        updated = await setSupportTicketField(ticket, 'priority', value as SupportTicketPriority, actor, supabase);
        break;
      }

      case 'category': {
        const value = body.value;
        if (typeof value !== 'string' || !(value in TICKET_CATEGORY_LABEL)) return badRequest('Pick a category from the list.');
        updated = await setSupportTicketField(ticket, 'category', value as SupportTicketCategory, actor, supabase);
        break;
      }

      default:
        return badRequest('Unknown action.');
    }

    const detail = await getSupportTicketDetail(updated.id, supabase);
    return NextResponse.json({ success: true, data: detail ?? updated });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return NextResponse.json({ error: 'Failed to update support ticket' }, { status: 500 });
  }
}
