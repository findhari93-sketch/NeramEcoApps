import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';
import { getRequestUser, isAdmin } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { decodeTokenRoles, envReport, missingRoles, summariseReceipts, type ReceiptRow } from '@/lib/delivery-health';
import { senderAppConfig } from '@/lib/teams-sender';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * GET /api/admin/delivery-health                                    (admin)
 * GET /api/admin/delivery-health?probeUserId=<users.id>[&asSender=<users.id>]
 *
 * Why notifications are or are not reaching people:
 *   env         which delivery env vars exist (and which carry a stray newline)
 *   graph       the permissions the app-only token REALLY has, and what is missing
 *   senders     every classroom, whose Teams sends its automatic reminders, and
 *               whether that connection still works
 *   last7Days   per event type, how many reached a Teams chat, the Teams feed and
 *               the bell, with the most common failure reason per tier
 *   probe       with ?probeUserId, one real test message through sendNudge and
 *               its receipt; add &asSender to send it as a connected teacher
 *
 * Admin only, no caching: it is a diagnostic read, used a handful of times.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (!isAdmin(caller)) throw new ApiError('Not authorized', 403);
    const supabase = getSupabaseAdminClient() as any;

    const graph: { roles: string[]; missing: string[]; error: string | null } = { roles: [], missing: [], error: null };
    try {
      graph.roles = decodeTokenRoles(await getAppOnlyToken());
      graph.missing = missingRoles(graph.roles);
    } catch (e) {
      graph.error = e instanceof Error ? e.message.slice(0, 200) : 'Could not get an app-only token';
    }

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [{ data: receipts, error }, { data: rooms }, { data: senderRows }] = await Promise.all([
      supabase
        .from('nexus_notification_deliveries')
        .select('event_type, chat, teams, inapp, channel, reasons')
        .gte('created_at', since)
        .limit(5000),
      supabase.from('nexus_classrooms').select('id, name, reminder_sender_id').eq('is_active', true),
      supabase.from('nexus_teams_senders').select('user_id, display_name, last_used_at, last_refreshed_at, last_error, revoked_at'),
    ]);
    const senderBy = new Map(((senderRows || []) as any[]).map((s) => [s.user_id, s]));

    let probe: unknown = null;
    const probeUserId = request.nextUrl.searchParams.get('probeUserId');
    if (probeUserId) {
      const asSender = request.nextUrl.searchParams.get('asSender');
      const { results } = await sendNudge({
        studentIds: [probeUserId],
        respectDormancy: false,
        subject: 'Test from Nexus, {firstName}',
        plain: 'This is a delivery check sent by an admin. You can ignore it.',
        eventType: 'assignment_nudge',
        metadata: { source: 'delivery_health_probe' },
        ...(asSender ? { sendAs: { senderUserId: asSender } } : {}),
        source: { kind: 'delivery_health_probe' },
      });
      probe = results[0] ?? null;
    }

    return NextResponse.json(
      {
        env: envReport(process.env),
        graph,
        automaticChats: {
          available: senderAppConfig() !== null,
          classrooms: ((rooms || []) as any[]).map((r) => {
            const s = r.reminder_sender_id ? senderBy.get(r.reminder_sender_id) : null;
            return {
              classroom: r.name,
              sender: s ? s.display_name : null,
              working: s ? !s.revoked_at : false,
              lastUsedAt: s?.last_used_at ?? null,
              lastRenewedAt: s?.last_refreshed_at ?? null,
              problem: !s ? 'No teacher has connected Teams for this class' : s.revoked_at ? s.last_error || 'Connection stopped working' : null,
            };
          }),
        },
        last7Days: error ? { error: error.message } : summariseReceipts((receipts || []) as ReceiptRow[]),
        probe,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not check delivery health');
  }
}
