export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, istDateKey, listDemoRequests } from '@neram/database';
import { loadDemoSettings } from '@/lib/demo/server';

/**
 * GET /api/demo-requests
 *
 * The request desk in one call: every v2 demo request from the last 120 days,
 * the KPI row, and the settings the Confirm form needs (hosts, windows).
 * Staff only (middleware). Tabs are filtered in the browser; volume is tens a week.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const [requests, settings] = await Promise.all([listDemoRequests({ since }, supabase), loadDemoSettings(supabase)]);

    const now = Date.now();
    const today = istDateKey(new Date());
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    const ago30 = now - 30 * 24 * 60 * 60 * 1000;

    const startOf = (s: string | null) => (s ? new Date(s).getTime() : null);
    let attended = 0;
    let noShow = 0;
    for (const r of requests) {
      const t = startOf(r.scheduled_start);
      if (t && t >= ago30 && t <= now) {
        if (r.status === 'attended') attended++;
        if (r.status === 'no_show') noShow++;
      }
    }

    // Enrolled after a demo: requests in the last 30 days whose person now has a student profile.
    const recentUserIds = Array.from(
      new Set(requests.filter((r) => r.user_id && new Date(r.created_at).getTime() >= ago30).map((r) => r.user_id as string)),
    );
    let enrolled = 0;
    if (recentUserIds.length) {
      const { data } = await (supabase as any).from('student_profiles').select('user_id').in('user_id', recentUserIds);
      enrolled = new Set((data ?? []).map((d: { user_id: string }) => d.user_id)).size;
    }

    const kpis = {
      newRequests: requests.filter((r) => r.status === 'pending').length,
      today: requests.filter((r) => r.status === 'approved' && r.scheduled_start && istDateKey(new Date(r.scheduled_start)) === today).length,
      confirmedNext7: requests.filter((r) => {
        const t = startOf(r.scheduled_start);
        return r.status === 'approved' && t !== null && t >= now - 60 * 60 * 1000 && t <= in7;
      }).length,
      attendanceRate30: attended + noShow ? Math.round((attended / (attended + noShow)) * 100) : null,
      enrolled30: enrolled,
      requests30: recentUserIds.length,
    };

    return NextResponse.json({
      requests,
      kpis,
      settings: {
        hosts: settings.hosts,
        defaultTutorUpn: settings.defaultTutorUpn,
        schedule: settings.schedule,
        drawingWhatsApp: settings.drawingWhatsApp,
      },
    });
  } catch (error) {
    console.error('demo-requests list failed:', error);
    return NextResponse.json({ error: 'Could not load demo requests' }, { status: 500 });
  }
}
