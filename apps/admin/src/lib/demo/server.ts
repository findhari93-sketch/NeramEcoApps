/**
 * Server helpers for the demo request desk: settings, and the WhatsApp sender
 * shared by the 5-minute cron and the desk actions (which send "now" messages
 * straight away instead of waiting for the next cron tick).
 */

import {
  getSupabaseAdminClient,
  getDueDemoMessages,
  getDemoRequestById,
  markDemoMessageResult,
  logDemoRequestEvent,
  resolveDemoSettings,
  demoTutorName,
  sendDemoRequestMessage,
  type DemoRequest,
  type DemoSettings,
  type DemoWaKind,
  type TypedSupabaseClient,
} from '@neram/database';
import { buildDemoMessageParams, demoMessageSkipReason } from './messages';
import { marketingOriginFor } from '@/lib/marketing-links';
import { cancelDemoEvent } from './teams';

export async function loadDemoSettings(client?: TypedSupabaseClient): Promise<DemoSettings> {
  const supabase = (client ?? getSupabaseAdminClient()) as any;
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle();
  return resolveDemoSettings(data?.value);
}

export function demoMarketingOrigin(requestUrl: string): string {
  let origin: string | null = null;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    origin = null;
  }
  return marketingOriginFor(origin, process.env.NEXT_PUBLIC_MARKETING_URL);
}

export interface SendSummary {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Send every due demo message (or only one request's). Each row is marked
 * sent, failed (retried by the next run up to 3 times) or skipped with the
 * reason, and logged on the request's activity.
 */
export async function sendDueDemoMessages(opts: {
  origin: string;
  registrationId?: string;
  now?: Date;
}): Promise<SendSummary> {
  const supabase = getSupabaseAdminClient();
  const now = opts.now ?? new Date();
  let due = await getDueDemoMessages(now, 'whatsapp', supabase);
  if (opts.registrationId) due = due.filter((m) => m.registration_id === opts.registrationId);
  const summary: SendSummary = { sent: 0, failed: 0, skipped: 0 };
  if (!due.length) return summary;

  const settings = await loadDemoSettings(supabase);
  const requests = new Map<string, DemoRequest | null>();

  for (const m of due) {
    if (!requests.has(m.registration_id)) {
      requests.set(m.registration_id, await getDemoRequestById(m.registration_id, supabase));
    }
    const request = requests.get(m.registration_id);
    if (!request) {
      await markDemoMessageResult(m, { status: 'skipped', error: 'request not found' }, supabase);
      summary.skipped++;
      continue;
    }

    const skip = demoMessageSkipReason(m, request, now);
    if (skip) {
      await markDemoMessageResult(m, { status: 'skipped', error: skip }, supabase);
      summary.skipped++;
      continue;
    }

    if (!m.to_phone || m.recipient === 'staff' || m.kind.startsWith('staff_')) {
      await markDemoMessageResult(m, { status: 'skipped', error: 'not a WhatsApp recipient' }, supabase);
      summary.skipped++;
      continue;
    }
    const params = buildDemoMessageParams({
      request,
      recipient: m.recipient,
      hostName: demoTutorName(settings, request),
      schedule: settings.schedule,
      marketingOrigin: opts.origin,
    });
    const result = await sendDemoRequestMessage(m.to_phone, m.kind as DemoWaKind, params);
    await markDemoMessageResult(
      m,
      result.success
        ? { status: 'sent', externalMessageId: result.messageId }
        : { status: 'failed', error: result.error },
      supabase,
    );
    await logDemoRequestEvent(
      {
        registration_id: request.id,
        kind: 'message',
        outcome: result.success ? 'sent' : 'failed',
        note: `WhatsApp "${m.kind}" to ${m.recipient}${result.success ? '' : `: ${result.error ?? 'unknown error'}`}`,
        actor_id: null,
      },
      supabase,
    ).catch(() => {});
    if (result.success) summary.sent++;
    else summary.failed++;
  }
  return summary;
}

/** graph_event_id once its Teams meeting has been cancelled, so no sweep repeats it. */
export function cancelledEventMarker(eventId: string): string {
  return eventId.startsWith('cancelled:') ? eventId : `cancelled:${eventId}`.slice(0, 500);
}

/**
 * Cancel the Teams meetings of demos a student cancelled from the website.
 * Marketing has no Microsoft credentials, so it only flips the status; this
 * runs with the 5-minute cron and does the Graph side.
 */
export async function sweepCancelledDemoEvents(): Promise<number> {
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('id, organizer_upn, graph_event_id, cancel_reason')
    .eq('status', 'cancelled')
    .not('graph_event_id', 'is', null)
    .not('graph_event_id', 'like', 'cancelled:%')
    .limit(10);
  if (error) throw error;
  let done = 0;
  for (const row of (data ?? []) as Array<{ id: string; organizer_upn: string | null; graph_event_id: string; cancel_reason: string | null }>) {
    try {
      if (row.organizer_upn) await cancelDemoEvent(row.organizer_upn, row.graph_event_id, row.cancel_reason || 'Cancelled');
      await supabase
        .from('demo_class_registrations')
        .update({ graph_event_id: cancelledEventMarker(row.graph_event_id) })
        .eq('id', row.id);
      done++;
    } catch (err) {
      console.error('demo event sweep failed for', row.id, err);
    }
  }
  return done;
}
