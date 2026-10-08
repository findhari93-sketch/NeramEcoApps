export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, istDateTime, listDemoRequests } from '@neram/database';
import { loadDemoSettings } from '@/lib/demo/server';
import { getTeamBusy, isDemoTeamsDryRun, DemoTeamsError } from '@/lib/demo/teams';

/**
 * GET /api/demo-requests/availability?date=YYYY-MM-DD&upns=a@x,b@x
 *
 * The Confirm dialog's timeline for one India day (8 AM to 10 PM): each team
 * member's busy blocks from Outlook (times only, never subjects) and the demos
 * already confirmed that day. Staff only (middleware).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date' }, { status: 400 });

  try {
    const settings = await loadDemoSettings();
    const known = new Set(settings.hosts.map((h) => h.upn));
    const upns = (url.searchParams.get('upns') || '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter((u) => known.has(u));

    const from = istDateTime(date, '08:00');
    const to = istDateTime(date, '22:00');

    const [busy, requests] = await Promise.all([
      getTeamBusy(upns, from, to).catch((err) => {
        if (err instanceof DemoTeamsError) return { __error: err.message } as const;
        throw err;
      }),
      listDemoRequests({ since: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() }, getSupabaseAdminClient()),
    ]);

    const demos = requests
      .filter((r) => r.status === 'approved' && r.scheduled_start)
      .filter((r) => {
        const t = new Date(r.scheduled_start as string).getTime();
        return t >= from.getTime() && t < to.getTime();
      })
      .map((r) => ({
        id: r.id,
        name: r.name,
        ref: r.ref_code,
        start: r.scheduled_start,
        minutes: r.scheduled_minutes,
        tutorUpn: r.tutor_upn,
      }));

    const error = '__error' in busy ? (busy as { __error: string }).__error : null;
    return NextResponse.json({
      date,
      from: from.toISOString(),
      to: to.toISOString(),
      busy: error ? {} : busy,
      busyError: error,
      dryRun: isDemoTeamsDryRun(),
      demos,
    });
  } catch (error) {
    console.error('demo availability failed:', error);
    return NextResponse.json({ error: 'Could not read calendars' }, { status: 500 });
  }
}
