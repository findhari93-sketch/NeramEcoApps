import { NextRequest, NextResponse } from 'next/server';
import { getExamResultRows, markExamResultsNotified } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';
import { buildStudentResultMessage } from '@/lib/exam-results-model';
import { shareBaseUrl } from '@/lib/class-share-links';

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
 * Reads the SNAPSHOT rather than recomputing, so what a student is shown when
 * they follow the link is the same row the channel card was built from.
 *
 * SENT BY NERAM ASSISTANT, not by whoever pressed Publish (founder, 2026-09-20).
 * Nobody wrote this message, and sending it from a teacher's own Teams chat put
 * exam results in the founder's personal thread with a student. The Assistant
 * carries a link instead of the marks, so the numbers live on the page that can
 * also explain them. While staff.assistant-sender is off, or the Teams manifest
 * is not approved yet, this lands in the activity feed and the bell.
 *
 * The notified_at filter is also what makes the second sitting safe to publish
 * later: the exam day students are not messaged twice.
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

    // The sitting sizes this used to compute are gone with the numbers: the
    // rank now comes off the snapshot on the page itself, which is the only
    // place it was ever safe to read it from. That also retires a real bug,
    // where this message said "3rd of 16" and the student's own card said
    // "Rank 3 of 44" about the same result.
    //
    // The page shows the caller their own result and nobody else's, so one url
    // serves the whole batch.
    const base = shareBaseUrl(request.nextUrl?.origin ?? null);
    const resultUrl = exam.scheduled_class_id ? `${base}/student/timetable/${exam.scheduled_class_id}/exam` : '';
    const notified: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < pending.length; i += CHUNK) {
      const batch = pending.slice(i, i + CHUNK);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const sitting = (row.sitting ?? 'main') as 'main' | 'second';
            const { subject, plain } = buildStudentResultMessage({
              examTitle: exam.title || 'Exam',
              hasPaper: Boolean(row.attempt_id),
              absent: row.absent,
              sitting: row.attempt_id ? sitting : null,
              provisional: row.is_provisional,
            });

            await sendNudge({
              assistant: { ...(resultUrl ? { link: { url: resultUrl, label: 'See my result' } } : {}) },
              studentIds: [row.student_id],
              subject,
              plain,
              eventType: 'exam_result',
              metadata: {
                exam_id: params.examId,
                class_id: exam.scheduled_class_id,
                rank: row.rank,
              },
              source: { kind: 'exam_result', refId: params.examId },
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
