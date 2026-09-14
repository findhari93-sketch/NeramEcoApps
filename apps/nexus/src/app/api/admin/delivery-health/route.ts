import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';
import { getRequestUser, isAdmin } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { decodeTokenRoles, envReport, missingRoles, summariseReceipts, type ReceiptRow } from '@/lib/delivery-health';
import { botConfig } from '@/lib/teams-bot';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * GET /api/admin/delivery-health                      (admin)
 * GET /api/admin/delivery-health?probeUserId=<users.id>
 *
 * Why notifications are or are not reaching people:
 *   env         which delivery env vars exist (and which carry a stray newline)
 *   graph       the permissions the app-only token REALLY has, and what is missing
 *   bot         whether the Neram Assistant bot is switched on
 *   last7Days   per event type, how many reached a chat, the bot, the Teams feed,
 *               the bell and email, with the most common failure reason per tier
 *   probe       with ?probeUserId, one real test message through sendNudge and its receipt
 *
 * Admin only, no caching: it is a diagnostic read, used a handful of times.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (!isAdmin(caller)) throw new ApiError('Not authorized', 403);

    const graph: { roles: string[]; missing: string[]; error: string | null } = { roles: [], missing: [], error: null };
    try {
      graph.roles = decodeTokenRoles(await getAppOnlyToken());
      graph.missing = missingRoles(graph.roles);
    } catch (e) {
      graph.error = e instanceof Error ? e.message.slice(0, 200) : 'Could not get an app-only token';
    }

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: receipts, error } = await (getSupabaseAdminClient() as any)
      .from('nexus_notification_deliveries')
      .select('event_type, chat, bot, teams, inapp, email, channel, reasons')
      .gte('created_at', since)
      .limit(5000);

    let probe: unknown = null;
    const probeUserId = request.nextUrl.searchParams.get('probeUserId');
    if (probeUserId) {
      const { results } = await sendNudge({
        studentIds: [probeUserId],
        respectDormancy: false,
        subject: 'Test from Nexus, {firstName}',
        plain: 'This is a delivery check sent by an admin. You can ignore it.',
        eventType: 'assignment_nudge',
        metadata: { source: 'delivery_health_probe' },
        source: { kind: 'delivery_health_probe' },
      });
      probe = results[0] ?? null;
    }

    return NextResponse.json(
      {
        env: envReport(process.env),
        graph,
        bot: { enabled: botConfig() !== null },
        last7Days: error ? { error: error.message } : summariseReceipts((receipts || []) as ReceiptRow[]),
        probe,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not check delivery health');
  }
}
