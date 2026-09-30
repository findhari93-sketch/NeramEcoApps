import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { createAdminNotification } from '@neram/database/queries';
import { verifyMsToken } from '@/lib/ms-verify';
import { adminOriginFor } from '@/lib/admin-links';
import { postHelpDeskCard } from '@/lib/help-desk-teams';
import { HELP_BUCKET, clientIp, handleHelpRequest, requesterKey } from '@/lib/help-request';

/**
 * POST /api/help (public, no sign-in needed)
 *
 * A help request from /help, usually from a student who cannot get into Nexus.
 * Saved in support_tickets and posted to the staff Help Desk chat in Teams. All
 * the rules live in lib/help-request.ts; this only wires in the real services.
 *
 * An Authorization header is optional. When a signed-in student sends one, the
 * ticket is tied to their account; a bad or expired token is ignored, never
 * refused, because being unable to sign in is the usual reason someone is here.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  const body = await request.json().catch(() => null);
  const key = requesterKey(clientIp(request.headers), process.env.SUPABASE_SERVICE_ROLE_KEY);
  const authHeader = request.headers.get('Authorization');

  const result = await handleHelpRequest(body, key, {
    supabase,
    signedInUser: async () => {
      if (!authHeader) return null;
      const ms = await verifyMsToken(authHeader);
      const { data } = await supabase.from('users').select('id, name, email').eq('ms_oid', ms.oid).maybeSingle();
      return data ?? null;
    },
    postCard: (card) => postHelpDeskCard(supabase, card),
    notifyAdmins: async (ticket) => {
      await createAdminNotification(
        {
          event_type: 'ticket_created',
          title: 'New Nexus help request',
          message: `${ticket.name}: ${ticket.subject}`,
          metadata: { ticket_id: ticket.id, ticket_number: ticket.ticket_number, category: ticket.category, source_app: 'nexus' },
        },
        supabase,
      );
    },
    ticketUrl: (id) =>
      `${adminOriginFor(request.nextUrl.origin, process.env.NEXT_PUBLIC_ADMIN_URL)}/support-tickets?highlight=${encodeURIComponent(id)}`,
    publicUrl: (path) => supabase.storage.from(HELP_BUCKET).getPublicUrl(path).data.publicUrl,
    now: () => new Date(),
  });

  const headers = result.status === 429 ? { 'Retry-After': String(result.body.retryAfter) } : undefined;
  return NextResponse.json(result.body, { status: result.status, headers });
}
