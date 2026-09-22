import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getQBReportContext,
  isQBReportTarget,
  markQBReportsNotified,
  resolveQBReportGroup,
  type QBReportOutcome,
} from '@neram/database';
import { tellReportersTheOutcome } from '@/lib/qb-report-notify';
import { describeError } from '@/lib/api-errors';

/**
 * Close a reported problem: every open report on one part of one question,
 * as "fixed" or "not a mistake", and tell each student who reported it.
 *
 * "Not a mistake" needs the teacher's reason, because a student told only
 * "you are wrong" learns nothing and stops reporting.
 */

const NOTE_LIMIT = 500;
const OUTCOMES: QBReportOutcome[] = ['fixed', 'not_a_mistake'];

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('Authorization');
    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const { id: questionId } = await params;

    const body = await request.json().catch(() => ({}));
    if (!isQBReportTarget(body?.target)) return bad('Say which part of the question this is about');
    if (!OUTCOMES.includes(body?.outcome)) return bad('Choose Mark fixed or Not a mistake');
    const target = body.target;
    const outcome = body.outcome as QBReportOutcome;
    const partLabel =
      typeof body.part_label === 'string' && body.part_label.trim() ? body.part_label.trim().slice(0, 4) : null;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > NOTE_LIMIT) return bad(`Keep the note under ${NOTE_LIMIT} characters`);
    if (outcome === 'not_a_mistake' && !note) return bad('Tell the students why it is not a mistake');

    const context = await getQBReportContext(questionId);
    if (!context) return bad('Question not found', 404);

    const { reportIds, studentIds } = await resolveQBReportGroup(questionId, target, partLabel, {
      outcome,
      note: note || null,
      resolvedBy: access.caller.id,
    });

    let notified = 0;
    if (studentIds.length > 0) {
      try {
        notified = await tellReportersTheOutcome({
          studentIds,
          outcome,
          note: note || null,
          target,
          partLabel,
          questionId,
          paperLabel: context.paper?.label ?? null,
          number: context.question.display_order ?? null,
          teacher: { authHeader, userId: access.caller.id },
          origin: request.nextUrl?.origin ?? null,
        });
        await markQBReportsNotified(reportIds);
      } catch (err) {
        // The reports stay closed: the fix is real whether or not the message
        // landed. notified_at stays empty, which is how a missed one is found.
        console.error('[QB API] Report outcome message failed:', describeError(err));
      }
    }

    return NextResponse.json({ data: { resolved: reportIds.length, notified } });
  } catch (err) {
    console.error('[QB API] Report resolve error:', describeError(err));
    return bad('That did not save. Try again in a moment.', 500);
  }
}
