import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getQBReportContext, markQBReportsNotified, resolveQBReport } from '@neram/database';
import { tellReportersTheOutcome } from '@/lib/qb-report-notify';
import { describeError } from '@/lib/api-errors';

/**
 * PATCH /api/question-bank/reports/[id]: act on ONE report.
 *
 * The screens close whole problems through questions/[id]/reports/resolve;
 * this stays for a single report. It is gated by verifyQBStaff, which lets
 * managers in (the user_type check it replaces refused them), and a closed
 * report tells its student exactly as the group action does.
 */

const STATUSES = ['in_review', 'resolved', 'dismissed'] as const;
type Status = (typeof STATUSES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const { id: reportId } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body?.status as Status;
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
    }
    const note = typeof body.resolution_note === 'string' ? body.resolution_note.trim().slice(0, 500) : '';
    if (status === 'dismissed' && !note) {
      return NextResponse.json({ error: 'Tell the student why it is not a mistake' }, { status: 400 });
    }

    const report = await resolveQBReport(reportId, {
      status,
      resolution_note: note || null,
      resolved_by: access.caller.id,
    });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    if (status !== 'in_review') {
      try {
        const context = await getQBReportContext(report.question_id);
        await tellReportersTheOutcome({
          studentIds: [report.student_id],
          outcome: status === 'resolved' ? 'fixed' : 'not_a_mistake',
          note: note || null,
          target: report.target,
          partLabel: report.part_label,
          questionId: report.question_id,
          paperLabel: context?.paper?.label ?? null,
          number: context?.question.display_order ?? null,
          teacher: { authHeader, userId: access.caller.id },
          origin: request.nextUrl?.origin ?? null,
        });
        await markQBReportsNotified([report.id]);
      } catch (err) {
        console.error('[QB API] Report outcome message failed:', describeError(err));
      }
    }

    return NextResponse.json({ data: report });
  } catch (err) {
    console.error('[QB API] Report resolve error:', describeError(err));
    return NextResponse.json({ error: 'That did not save. Try again in a moment.' }, { status: 500 });
  }
}
