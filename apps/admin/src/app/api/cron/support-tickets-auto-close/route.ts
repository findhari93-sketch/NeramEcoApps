export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { autoCloseSupportTicket, getExpiredSupportTickets, getSupabaseAdminClient } from '@neram/database';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { tellRequester } from '@/lib/support-inbox/server';

/** Most tickets closed in one run. The rest wait for tomorrow. */
const AUTO_CLOSE_BATCH = 200;

/**
 * GET /api/cron/support-tickets-auto-close (Vercel Cron, 02:45 UTC = 08:15 IST).
 * Fails closed without CRON_SECRET.
 *
 * Closes every ticket whose auto_close_at has passed:
 *   waiting_on_student     7 days with no reply   closes as no_response
 *   awaiting_confirmation  3 days unconfirmed     closes keeping its outcome
 *
 * Each close is conditioned on the status the cron read, so a ticket the
 * requester answered a moment ago is skipped, not closed. The close writes a
 * requester-visible auto_closed activity row; the requester gets a bell entry
 * and one email.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdminClient() as any;
  try {
    const expired = await getExpiredSupportTickets(AUTO_CLOSE_BATCH, supabase);
    let closed = 0;
    let skipped = 0;
    let failed = 0;

    for (const ticket of expired) {
      try {
        const done = await autoCloseSupportTicket(ticket, supabase);
        if (!done) {
          skipped += 1;
          continue;
        }
        closed += 1;
        await tellRequester(done, 'auto_closed', { outcome: done.resolution_code, supabase });
      } catch (err) {
        failed += 1;
        console.error(`[support-tickets-auto-close] ${ticket.ticket_number} failed:`, err);
      }
    }

    return NextResponse.json({ success: true, scanned: expired.length, closed, skipped, failed });
  } catch (error) {
    console.error('[support-tickets-auto-close] run failed:', error);
    return NextResponse.json({ error: 'Auto-close failed' }, { status: 500 });
  }
}
