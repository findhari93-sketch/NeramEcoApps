export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  resolveFeeCorrectionReport,
  getFeeCorrectionReport,
  CORRECTION_NOTE_MAX,
} from '@neram/database';
import { UUID_REGEX, actingAdminId } from '@/lib/fee-request';
import { askNexus } from '@/lib/record-check-send';

/**
 * POST /api/students/record-check/corrections/:id  Body: { action: 'reject', note }
 *
 * Rejecting a student's fee report. Accepting goes through the Application and
 * fees form (resolvesCorrectionId), so money is written in one place only.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const reportId = params.id;
  if (!UUID_REGEX.test(reportId)) return NextResponse.json({ error: 'A valid report id is required.' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'reject') {
    return NextResponse.json({ error: 'To accept, use Accept and update fees.' }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!note) return NextResponse.json({ error: 'Tell the student why.' }, { status: 400 });
  if (note.length > CORRECTION_NOTE_MAX) {
    return NextResponse.json({ error: `Keep the note under ${CORRECTION_NOTE_MAX} characters.` }, { status: 400 });
  }
  try {
    const sb: any = createAdminClient();
    const resolved = await resolveFeeCorrectionReport(sb, {
      reportId,
      status: 'rejected',
      resolvedBy: actingAdminId(request, body),
      note,
    });
    if (!resolved) {
      const existing = await getFeeCorrectionReport(sb, reportId);
      return NextResponse.json(
        { error: existing ? 'This report was already answered. Reload to see the latest.' : 'No such report.' },
        { status: existing ? 409 : 404 },
      );
    }
    const delivery = await askNexus(request, { action: 'resolution', reportId });
    return NextResponse.json({
      report: resolved,
      delivered: delivery.delivered,
      channel: delivery.channel,
      message: delivery.delivered ? `Rejected. ${delivery.message}` : delivery.message,
    });
  } catch (err: any) {
    console.error('[record-check/corrections] POST failed:', err?.message);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
