import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getFeeCorrectionReport } from '@neram/database/queries';
import { authorisedBearer } from '@/lib/internal-auth';
import { sendCorrectionResolution, sendRecordCheckById } from '@/lib/record-check-send';

/**
 * POST /api/internal/student-record-check
 *
 * Admin asks Nexus to message a student, because sendNudge (the one door to a
 * student) lives here. Authorised by NEXUS_INTERNAL_TOKEN alone, compared in
 * constant time; there is no Microsoft sign-in on this route.
 *
 *   { action: 'send', checkId }         send a queued "Check your details"
 *                                       404 unknown, 409 not queued
 *   { action: 'resolution', reportId }  tell the student what the office did
 *                                       with their fee report
 *
 * Both answer { ok, channel, summary }, summary being the plain sentence Admin
 * shows staff ("Sent in Teams.", "Waiting in their Nexus bell.").
 * Mutations only, called a few times a day by staff, so a route is right.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!authorisedBearer(request, 'NEXUS_INTERNAL_TOKEN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = getSupabaseAdminClient() as any;
  const origin = request.nextUrl.origin;

  try {
    if (body.action === 'send') {
      const checkId = typeof body.checkId === 'string' ? body.checkId : '';
      if (!UUID.test(checkId)) return NextResponse.json({ error: 'checkId is required.' }, { status: 400 });
      const result = await sendRecordCheckById(supabase, checkId, origin);
      return NextResponse.json(result.body, { status: result.status });
    }

    if (body.action === 'resolution') {
      const reportId = typeof body.reportId === 'string' ? body.reportId : '';
      if (!UUID.test(reportId)) return NextResponse.json({ error: 'reportId is required.' }, { status: 400 });
      const report = await getFeeCorrectionReport(supabase, reportId);
      if (!report) return NextResponse.json({ error: 'No such report.' }, { status: 404 });
      if (report.status === 'open') {
        return NextResponse.json({ error: 'This report is still open.' }, { status: 409 });
      }
      const outcome = await sendCorrectionResolution(report, origin);
      return NextResponse.json({ ok: outcome.ok, channel: outcome.channel, summary: outcome.summary });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send that';
    console.error('[student-record-check]', body.action, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
