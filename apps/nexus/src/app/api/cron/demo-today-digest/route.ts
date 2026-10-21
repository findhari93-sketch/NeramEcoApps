import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  istDateKey,
  listApprovedDemosForIstDay,
  claimDemoTodayDigest,
  staffUserIdsByUpn,
  resolveDemoSettings,
  type DemoRequest,
} from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { adminOriginFor } from '@/lib/admin-links';
import { sendNudge } from '@/lib/nudge-delivery';
import { buildTodayDigest } from '@/lib/demo-staff-reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/demo-today-digest (Vercel Cron, 02:30 UTC = 08:00 IST)
 *
 * One "you have N demos today" Neram Assistant message per tutor, so each tutor
 * sees their whole day at once instead of one ping per demo. Idempotent: it
 * claims (day_key, user_id) in demo_today_digest_log before sending, so an
 * overlapping run never messages a tutor twice. The per-demo "starts in 15
 * minutes" reminder is unchanged (the demo-staff-reminders cron).
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const dayKey = istDateKey(now);
    const demos = await listApprovedDemosForIstDay(dayKey, supabase);

    // Group today's demos by the tutor who takes each one.
    const byTutor = new Map<string, DemoRequest[]>();
    for (const r of demos) {
      const upn = (r.tutor_upn || r.organizer_upn || '').toLowerCase();
      if (!upn) continue;
      const list = byTutor.get(upn) ?? [];
      list.push(r);
      byTutor.set(upn, list);
    }
    if (byTutor.size === 0) return NextResponse.json({ success: true, sent: 0, skipped: 0, failed: 0 });

    const ids = await staffUserIdsByUpn([...byTutor.keys()], supabase);
    const adminOrigin = adminOriginFor(new URL(request.url).origin, process.env.NEXT_PUBLIC_ADMIN_URL);
    const { data: settingsRow } = await (supabase as any)
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_class')
      .maybeSingle();
    const settings = resolveDemoSettings(settingsRow?.value);
    const nameOf = (upn: string) => settings.hosts.find((h) => h.upn.toLowerCase() === upn)?.name ?? '';

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const [upn, list] of byTutor) {
      const userId = ids[upn];
      if (!userId) {
        skipped++;
        continue;
      }
      // Claim before sending: an overlapping run then sees it is taken and skips.
      const claimed = await claimDemoTodayDigest(dayKey, userId, supabase);
      if (!claimed) {
        skipped++;
        continue;
      }
      const nudge = buildTodayDigest(nameOf(upn), list, adminOrigin);
      const { results } = await sendNudge({
        studentIds: [userId],
        audience: 'staff',
        subject: nudge.subject,
        plain: nudge.plain,
        eventType: 'demo_reminder',
        assistant: { link: nudge.link },
        metadata: { kind: 'demo_today_digest', day: dayKey, count: list.length },
        source: { kind: 'demo_reminder', refId: `demo-today:${dayKey}:${userId}` },
      });
      if (results[0]?.ok) sent++;
      else failed++;
    }

    return NextResponse.json({ success: true, sent, skipped, failed });
  } catch (error) {
    console.error('demo-today-digest cron failed:', error);
    return NextResponse.json({ error: 'demo-today-digest failed' }, { status: 500 });
  }
}
