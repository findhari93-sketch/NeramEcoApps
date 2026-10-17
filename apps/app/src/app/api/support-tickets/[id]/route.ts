export const dynamic = 'force-dynamic';

/**
 * One support ticket, for the person who raised it (Tools App, Firebase auth).
 *
 * GET   /api/support-tickets/[id]   [id] is the UUID or NERAM-TKT-xxxxx.
 *       The ticket as its owner may see it: no console logs, device info,
 *       reopen snapshots, internal notes, hidden activity or staff ids. Opening
 *       it marks the thread read for the student.
 *
 * PATCH /api/support-tickets/[id]   { action: 'confirm' }
 *                                   { action: 'reopen', reason?, snapshot? }
 *       confirm: "Yes, it is fixed" while the ticket awaits confirmation.
 *       reopen:  "Still happening" while awaiting confirmation, or up to 7 days
 *                after it closed. Keeps a fresh device + console snapshot for staff.
 *       409 when the move is not allowed now, or the ticket changed meanwhile.
 *
 * Somebody else's ticket answers 404, the same as one that does not exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getSupportTicketByRef,
  getSupportTicketDetail,
  markSupportTicketSeen,
  confirmSupportTicket,
  reopenSupportTicket,
  createAdminNotification,
} from '@neram/database';
import type { SupportTicketReopenSnapshot } from '@neram/database';
import { canTicketMove, canStudentReopenTicket } from '@neram/database/support-ticket-status';
import {
  requireSignedInRequester,
  normalizeConsoleLogs,
  normalizeDeviceInfo,
  normalizeScreenshots,
} from '@/lib/student-ticket';
import { toStudentTicketPayload } from '@/lib/student-ticket-view';

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

function conflict(error: string, message: string) {
  return NextResponse.json({ error, message }, { status: 409 });
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    if (!id) return notFound();

    const supabase = getSupabaseAdminClient();
    const view = await getSupportTicketDetail(id, supabase, { forStudent: true });
    if (!view || view.user_id !== auth.userId) return notFound();

    await markSupportTicketSeen(view.id, 'student', supabase);

    return NextResponse.json(toStudentTicketPayload(view));
  } catch (error) {
    console.error('Error getting support ticket detail:', error);
    return NextResponse.json({ error: 'Failed to get ticket detail' }, { status: 500 });
  }
}

function buildSnapshot(raw: unknown, reason: string | null): SupportTicketReopenSnapshot {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    at: new Date().toISOString(),
    reason,
    page_url: typeof s.page_url === 'string' ? s.page_url.slice(0, 500) : null,
    console_logs: normalizeConsoleLogs(s.console_logs) ?? null,
    device_info: normalizeDeviceInfo(s.device_info) ?? null,
    screenshot_urls: normalizeScreenshots(s.screenshot_urls),
  };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireSignedInRequester(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action !== 'confirm' && action !== 'reopen') {
      return NextResponse.json({ error: 'action must be confirm or reopen' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const ticket = id ? await getSupportTicketByRef(id, supabase) : null;
    if (!ticket || ticket.user_id !== auth.userId) return notFound();

    const actor = { id: auth.userId, name: auth.userName };

    if (action === 'confirm') {
      if (!canTicketMove(ticket.status, 'confirm', 'student')) {
        return conflict('not_allowed', 'This request is not waiting for your confirmation.');
      }
      const moved = await confirmSupportTicket(ticket, actor, supabase);
      if (!moved) return conflict('changed', 'This request changed. Showing the latest.');
      return NextResponse.json({ ok: true, status: moved.status });
    }

    // reopen
    if (!canTicketMove(ticket.status, 'reopen', 'student')) {
      return conflict('not_allowed', 'This request is still open.');
    }
    if (!canStudentReopenTicket({ status: ticket.status, closed_at: ticket.closed_at })) {
      return conflict(
        'reopen_window_passed',
        'This request closed more than 7 days ago. Please report it again as a new request.',
      );
    }

    const reason =
      typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
    const moved = await reopenSupportTicket(
      ticket,
      actor,
      { reason, snapshot: buildSnapshot(body?.snapshot, reason) },
      supabase,
    );
    if (!moved) return conflict('changed', 'This request changed. Showing the latest.');

    try {
      await createAdminNotification({
        event_type: 'ticket_reopened',
        title: 'Ticket reopened',
        message: `${auth.userName} says ${ticket.ticket_number} is still happening${reason ? `: "${reason.slice(0, 140)}"` : ''}`,
        metadata: { ticket_id: ticket.id, ticket_number: ticket.ticket_number, source_app: 'app' },
      });
    } catch (err) {
      console.error('[support-tickets] reopen notification failed:', err);
    }

    return NextResponse.json({ ok: true, status: moved.status });
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}
