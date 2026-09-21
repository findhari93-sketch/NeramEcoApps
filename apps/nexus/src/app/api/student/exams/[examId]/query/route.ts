import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, createFoundationIssue, isRankedResultRow } from '@neram/database';
import { refuseUnlessStudent, verifyQBAccess } from '@/lib/qb-auth';
import { sendNudge } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';
import {
  explainExamResult,
  renderFactsForTeacher,
  resultQueryReason,
  resultQueryRequiresNote,
  type ExplainAttempt,
} from '@/lib/exam-result-explain';

/** Long enough for a real explanation, short enough not to be a storage problem. */
const MAX_NOTE = 1000;

/**
 * POST /api/student/exams/[examId]/query   (student)
 *
 * "Something looks wrong with my result."
 *
 * GOES STRAIGHT TO THE TEACHER (founder, 2026-09-20), rather than sitting in an
 * inbox for somebody to pick up. The class teacher gets a Teams message the
 * moment the student presses send, and it carries the working: which attempt was
 * counted, the marks, the arithmetic behind the percentage, the rank and the
 * sitting it was ranked in, and every other attempt the student has on the paper
 * with the higher ones called out. Most of these disputes answer themselves from
 * that paragraph, and the teacher never has to open anything.
 *
 * It ALSO writes a nexus_foundation_issues row. The ticket table is already live
 * with numbers, a staff inbox, an activity log and auto-close, the row costs one
 * insert, and without it nothing records what was decided. The teacher is still
 * pinged immediately, which is the part that was asked for.
 *
 * The message is sent BY NERAM ASSISTANT. It is generated, not typed, and the
 * student is not the one who can send a Teams chat to staff anyway.
 *
 * One open query per student per exam. A second press returns the first one
 * rather than raising a duplicate: a student who is worried presses twice.
 */
export async function POST(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const body = await request.json().catch(() => ({}));

    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    const { caller } = access;

    const notAStudent = refuseUnlessStudent(caller);
    if (notAStudent) return notAStudent;

    const reason = resultQueryReason(body?.reason_code);
    if (!reason) return NextResponse.json({ error: 'Pick what looks wrong.' }, { status: 400 });

    const note = String(body?.note ?? '').trim().slice(0, MAX_NOTE);
    if (resultQueryRequiresNote(reason.code) && !note) {
      return NextResponse.json({ error: 'Say what looks wrong, so your teacher can check it.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: exam } = await supabase
      .from('nexus_exams')
      .select('id, title, scheduled_class_id, classroom_id, results_state, passing_pct')
      .eq('id', params.examId)
      .maybeSingle();
    if (!exam) return NextResponse.json({ error: 'That exam no longer exists.' }, { status: 404 });

    // Nothing to query before the teacher has published. Saying so is kinder
    // than a ticket that reads "my result is wrong" about a result nobody has.
    if (exam.results_state === 'unpublished') {
      return NextResponse.json(
        { error: 'These results are not out yet. Once your teacher publishes them you can ask about yours.' },
        { status: 409 },
      );
    }

    const { data: rows } = await supabase
      .from('nexus_exam_results')
      .select('student_id, attempt_id, score, total_marks, percentage, rank, sitting, is_provisional, absent')
      .eq('exam_id', params.examId);
    const all = (rows || []) as any[];
    const mine = all.find((r) => r.student_id === caller.id) || null;
    if (!mine) {
      return NextResponse.json({ error: 'You are not on the published list for this exam.' }, { status: 404 });
    }

    // One open query per student per exam. Reusing the row keeps the teacher's
    // inbox honest and stops a worried student raising five.
    const { data: existing } = await supabase
      .from('nexus_foundation_issues')
      .select('id, ticket_number, status')
      .eq('student_id', caller.id)
      .eq('category', 'result_dispute')
      .contains('context', { exam_id: params.examId })
      .neq('status', 'closed')
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json(
        { data: { issue_id: existing.id, ticket_number: existing.ticket_number, already_open: true } },
        { status: 200 },
      );
    }

    const sitting = (mine.sitting ?? 'main') as 'main' | 'second';
    const sittingSize = all.filter((r) => isRankedResultRow(r) && (r.sitting ?? 'main') === sitting).length;

    // Every attempt on the paper, so "I scored more" can be answered rather than
    // argued. The snapshot's attempt_id is matched by id, never by position.
    //
    // The paper is resolved from the exam's own placement, never from the body:
    // a student who can name any test_id could otherwise have their teacher told
    // about somebody else's attempts.
    const { data: placement } = await supabase
      .from('nexus_test_placements')
      .select('test_id')
      .eq('context_type', 'exam')
      .eq('context_id', exam.scheduled_class_id)
      .eq('is_active', true)
      .maybeSingle();

    const { data: attemptRows } = placement?.test_id
      ? await supabase
          .from('nexus_test_attempts')
          .select('id, attempt_number, percentage, started_at, submitted_at, mode')
          .eq('student_id', caller.id)
          .eq('test_id', placement.test_id)
          .order('attempt_number', { ascending: true })
      : { data: [] };

    const attempts: ExplainAttempt[] = ((attemptRows || []) as any[]).map((a) => ({
      id: a.id,
      attemptNumber: Number(a.attempt_number) || 0,
      percentage: a.percentage == null ? null : Number(a.percentage),
      startedAt: a.started_at ?? null,
      submittedAt: a.submitted_at ?? null,
      mode: a.mode ?? null,
    }));

    const facts = explainExamResult({
      examTitle: exam.title || 'Exam',
      snapshot: {
        attemptId: mine.attempt_id ?? null,
        score: mine.score == null ? null : Number(mine.score),
        totalMarks: mine.total_marks == null ? null : Number(mine.total_marks),
        percentage: mine.percentage == null ? null : Number(mine.percentage),
        rank: mine.rank ?? null,
        sitting,
        isProvisional: Boolean(mine.is_provisional),
        absent: Boolean(mine.absent),
      },
      sittingSize,
      attempts,
      passingPctNow: exam.passing_pct == null ? null : Number(exam.passing_pct),
    });

    const said = note ? `${reason.label}. ${note}` : reason.label;
    const studentName = (caller as any).name || 'A student';

    const issue = await createFoundationIssue({
      student_id: caller.id,
      title: `Result query: ${exam.title || 'Exam'}`,
      description: said,
      category: 'result_dispute',
      page_url: exam.scheduled_class_id ? `/student/timetable/${exam.scheduled_class_id}/exam` : undefined,
      context: {
        exam_id: params.examId,
        classroom_id: exam.classroom_id ?? null,
        reason_code: reason.code,
        facts: facts as unknown as Record<string, unknown>,
      },
    });

    // Who hears about it: the class tutor, else the classroom's connected
    // sender, else everyone who can teach on it. Never nobody.
    const recipients = await teachersFor(supabase, exam);
    let told = 0;
    if (recipients.length > 0) {
      const base = shareBaseUrl(request.nextUrl?.origin ?? null);
      const { counts } = await sendNudge({
        studentIds: recipients,
        audience: 'staff',
        subject: `${studentName} is asking about their result`,
        plain: renderFactsForTeacher(facts, studentName, said),
        eventType: 'result_dispute_raised',
        metadata: { issue_id: issue.id, exam_id: params.examId, class_id: exam.scheduled_class_id ?? null },
        assistant: { link: { url: `${base}/teacher/issues?issue=${issue.id}`, label: 'Open the ticket' } },
        source: { kind: 'result_dispute', refId: params.examId },
      });
      told = counts.chat + counts.teams + counts.inapp;
    }

    return NextResponse.json(
      { data: { issue_id: issue.id, ticket_number: (issue as any).ticket_number ?? null, teachers_told: told } },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam result query] ', message);
    return NextResponse.json({ error: 'That did not send. Try again in a moment.' }, { status: 500 });
  }
}

/**
 * The staff who should hear about this, most specific first.
 *
 * A dispute with nobody to send it to is the failure mode worth avoiding, so
 * this widens rather than gives up.
 */
async function teachersFor(supabase: any, exam: { scheduled_class_id: string | null; classroom_id: string | null }): Promise<string[]> {
  if (exam.scheduled_class_id) {
    const { data: cls } = await supabase
      .from('nexus_scheduled_classes')
      .select('tutor_id')
      .eq('id', exam.scheduled_class_id)
      .maybeSingle();
    if (cls?.tutor_id) return [cls.tutor_id as string];
  }
  if (!exam.classroom_id) return [];

  const { data: room } = await supabase
    .from('nexus_classrooms')
    .select('reminder_sender_id')
    .eq('id', exam.classroom_id)
    .maybeSingle();
  if (room?.reminder_sender_id) return [room.reminder_sender_id as string];

  const { data: staff } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', exam.classroom_id)
    .eq('role', 'teacher')
    .eq('is_active', true);
  return [...new Set(((staff || []) as any[]).map((s) => s.user_id as string))];
}
