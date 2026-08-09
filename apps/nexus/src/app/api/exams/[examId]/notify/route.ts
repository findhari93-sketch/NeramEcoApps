import { NextRequest, NextResponse } from 'next/server';
import { getExamResultRows, markExamResultsNotified } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';
import { buildStudentResultMessage } from '@/lib/exam-results-model';

/**
 * Tell each student their own rank and marks.
 *
 * SPLIT OUT FROM publish ON PURPOSE. Thirty personalised nudges, each fanning
 * out to a Teams activity ping, an in-app row and possibly an email backstop,
 * will not fit comfortably in one serverless budget alongside a Graph channel
 * post. A timeout here must not cost the teacher the announcement they already
 * made, so the two are separate calls and the dialog fires this immediately
 * after publish returns.
 *
 * Reads the SNAPSHOT rather than recomputing, so the rank a student is told
 * privately is byte-identical to the one the channel card was built from.
 */

/** Chunked so one long request does not hold a function open for a minute. */
const CHUNK = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;
    const exam = access.exam;

    if (exam.results_state === 'unpublished') {
      return NextResponse.json(
        { error: 'Publish the results before telling students about them.' },
        { status: 400 },
      );
    }

    const rows = await getExamResultRows(params.examId);
    // notified_at makes a retry safe: a second press only picks up whoever the
    // first press did not reach.
    const pending = rows.filter((r) => !r.notified_at);
    if (pending.length === 0) {
      return NextResponse.json({ data: { notified: 0, already: rows.length } }, { status: 200 });
    }

    const totalSat = rows.filter((r) => !r.absent && r.attempt_id).length;
    const notified: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < pending.length; i += CHUNK) {
      const batch = pending.slice(i, i + CHUNK);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const { subject, plain } = buildStudentResultMessage({
              examTitle: exam.title || 'Exam',
              row: {
                student_id: row.student_id,
                student_name: '',
                attempt_id: row.attempt_id,
                score: Number(row.score) || 0,
                total_marks: Number(row.total_marks) || 0,
                percentage: Number(row.percentage) || 0,
                provisional: row.is_provisional,
                absent: row.absent,
                time_spent_seconds: null,
                section_scores: Array.isArray(row.section_scores) ? (row.section_scores as any) : [],
                rank: row.rank,
              },
              totalSat,
              provisional: row.is_provisional,
              passingPct: exam.passing_pct == null ? null : Number(exam.passing_pct),
            });

            await sendNudge({
              studentIds: [row.student_id],
              subject,
              plain,
              eventType: 'exam_result',
              metadata: {
                exam_id: params.examId,
                class_id: exam.scheduled_class_id,
                rank: row.rank,
              },
            });
            notified.push(row.student_id);
          } catch (err) {
            console.error(`[Exam notify] ${row.student_id} was not reached:`, err);
            failed.push(row.student_id);
          }
        }),
      );
    }

    await markExamResultsNotified(params.examId, notified);

    return NextResponse.json(
      { data: { notified: notified.length, failed: failed.length } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Notify API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
