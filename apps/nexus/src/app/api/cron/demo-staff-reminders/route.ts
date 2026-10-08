import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDueDemoMessages,
  getDemoRequestById,
  markDemoMessageResult,
  logDemoRequestEvent,
  resolveDemoSettings,
  demoTutorName,
  type DemoRequest,
} from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { adminOriginFor } from '@/lib/admin-links';
import { sendNudge } from '@/lib/nudge-delivery';
import { buildStaffReminder, staffReminderSkipReason } from '@/lib/demo-staff-reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/demo-staff-reminders (Vercel Cron, every 5 minutes)
 *
 * Neram Assistant reminders for the demo team, queued by Admin and Marketing
 * in demo_request_messages (channel 'assistant'): a new request to call, a
 * call-back that is due, 8 AM "demo today", and "starts in 15 minutes" to the
 * tutor. Sent with sendNudge (audience staff): Assistant chat, else the Teams
 * activity feed, plus the Nexus bell. Most runs find nothing.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const due = await getDueDemoMessages(now, 'assistant', supabase);
    if (!due.length) return NextResponse.json({ success: true, sent: 0 });

    const { data: settingsRow } = await (supabase as any)
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_class')
      .maybeSingle();
    const settings = resolveDemoSettings(settingsRow?.value);
    const adminOrigin = adminOriginFor(new URL(request.url).origin, process.env.NEXT_PUBLIC_ADMIN_URL);
    const requests = new Map<string, DemoRequest | null>();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const m of due) {
      if (!requests.has(m.registration_id)) requests.set(m.registration_id, await getDemoRequestById(m.registration_id, supabase));
      const r = requests.get(m.registration_id);
      const skip = !r ? 'request not found' : !m.to_user_id ? 'no recipient' : staffReminderSkipReason(m, r, now);
      if (skip || !r || !m.to_user_id) {
        await markDemoMessageResult(m, { status: 'skipped', error: skip ?? 'skipped' }, supabase);
        skipped++;
        continue;
      }

      const nudge = buildStaffReminder(m, r, { tutorName: demoTutorName(settings, r), adminOrigin, schedule: settings.schedule });
      const { results } = await sendNudge({
        studentIds: [m.to_user_id],
        audience: 'staff',
        subject: nudge.subject,
        plain: nudge.plain,
        eventType: 'demo_reminder',
        assistant: { link: nudge.link },
        metadata: { registration_id: r.id, kind: m.kind },
        source: { kind: 'demo_reminder', refId: r.id },
      });
      const res = results[0];
      const ok = !!res?.ok;
      await markDemoMessageResult(
        m,
        ok
          ? { status: 'sent', externalMessageId: res.channel }
          : { status: 'failed', error: res?.reasons?.chat || res?.reasons?.teams || res?.channel || 'not delivered' },
        supabase,
      );
      await logDemoRequestEvent(
        {
          registration_id: r.id,
          kind: 'message',
          outcome: ok ? 'sent' : 'failed',
          note: `Neram Assistant "${m.kind.replace('staff_', '')}" to ${res?.name || 'staff'} (${res?.channel ?? 'failed'})`,
          actor_id: null,
        },
        supabase,
      ).catch(() => {});
      if (ok) sent++;
      else failed++;
    }

    return NextResponse.json({ success: true, sent, skipped, failed });
  } catch (error) {
    console.error('demo-staff-reminders cron failed:', error);
    return NextResponse.json({ error: 'demo-staff-reminders failed' }, { status: 500 });
  }
}
