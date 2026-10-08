export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { demoIcs, getDemoRequestByToken } from '@neram/database';

/**
 * GET /api/demo-class/ics/{token}: the confirmed demo as an .ics file, for
 * Apple Calendar and Outlook. Gmail users also get the organizer's real
 * invite by email; this is the "add it yourself" fallback.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const r = await getDemoRequestByToken(params.token);
    if (!r || r.status !== 'approved' || !r.scheduled_start) {
      return NextResponse.json({ error: 'No confirmed demo for this link' }, { status: 404 });
    }
    const ics = demoIcs({
      title: 'Neram free demo class',
      start: new Date(r.scheduled_start),
      minutes: r.scheduled_minutes,
      details: 'Live NATA / JEE Paper 2 demo class on Microsoft Teams. Parents are welcome to join.',
      url: r.teams_join_url || `https://neramclasses.com/d/${params.token}`,
      uid: r.ref_code || r.id,
    });
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="neram-demo-${(r.ref_code || 'class').toLowerCase()}.ics"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('demo ics failed:', error);
    return NextResponse.json({ error: 'Could not build the calendar file' }, { status: 500 });
  }
}
